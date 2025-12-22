import { Injectable } from '@angular/core';
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Ticket } from './ticket-store.service';

export type TicketPdfOptions = {
  /** 画面や帳票ヘッダに出すアプリ名など（任意） */
  appTitle?: string;

  /** ダウンロードファイル名（未指定なら自動） */
  filename?: string;

  /**
   * 'list' = 一覧表（全件出力はこちらに割り切る）
   * 'detail' = 単票（詳細）※一覧で1件選択のときに使う想定
   */
  layout?: 'detail' | 'list';

  /** 帳票タイトル（未指定なら自動） */
  title?: string;

  /** TTF の URL（例: /assets/fonts/NotoSansJP-Regular.ttf） */
  fontUrl?: string;

  /** ヘッダに表示するロゴ（任意） */
  logoUrl?: string | null;

  /** 透かしスタンプ画像（任意） */
  stampUrl?: string | null;
};

@Injectable({ providedIn: 'root' })
export class TicketPdfService {
  /**
   * 複数チケットの PDF を生成してダウンロードする。
   *
   * 実務メモ:
   * - 一覧画面の「全件」は list に固定運用でOK（詳細は別導線）
   * - 「選択1件」は downloadTicketPdf() を使う（= detail を確実に出す）
   */
  async downloadTicketsPdf(tickets: Ticket[], opts: TicketPdfOptions = {}): Promise<void> {
    const layout = opts.layout ?? 'list';
    const filename =
      opts.filename ?? `tickets-${new Date().toISOString().slice(0, 10)}-${layout}.pdf`;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontUrl = this.normalizeUrl(opts.fontUrl ?? '/assets/fonts/NotoSansJP-Regular.ttf');
    const font = await this.tryLoadTtf(pdfDoc, fontUrl);

    const logoImage = await this.tryLoadImage(
      pdfDoc,
      this.normalizeUrlOrNull(opts.logoUrl ?? null)
    );
    const stampImage = await this.tryLoadImage(
      pdfDoc,
      this.normalizeUrlOrNull(opts.stampUrl ?? null)
    );

    if (layout === 'list') {
      this.buildListPdf(pdfDoc, font, tickets, opts, logoImage, stampImage);
    } else {
      this.buildDetailPdf(pdfDoc, font, tickets, opts, logoImage, stampImage);
    }

    /**
     * TS2322 対策:
     * - pdf-lib save() の返却型が環境により ArrayBufferLike を含み、BlobPart と噛み合わないことがある
     * - 安全のため Uint8Array にコピーして Blob 化する
     */
    const bytes = await pdfDoc.save();
    const safe = new Uint8Array(bytes);
    this.downloadBlob(new Blob([safe], { type: 'application/pdf' }), filename);
  }

  /**
   * 単票（1件）PDF
   *
   * 実務メモ:
   * - 一覧で 1件選択 → これを呼ぶと、常に detail 出力になる（誤って list にならない）
   * - ファイル名は ticket-{no}-YYYY-MM-DD.pdf に寄せると運用で探しやすい
   */
  async downloadTicketPdf(ticket: Ticket, opts: TicketPdfOptions = {}): Promise<void> {
    const no = String(ticket.no ?? '');
    const filename =
      opts.filename ?? `ticket-${no || 'x'}-${new Date().toISOString().slice(0, 10)}.pdf`;

    await this.downloadTicketsPdf([ticket], { ...opts, filename, layout: 'detail' });
  }

  // =========================
  // list: 一覧表（全件・複数選択）
  // =========================
  private buildListPdf(
    pdfDoc: PDFDocument,
    font: PDFFont,
    tickets: Ticket[],
    opts: TicketPdfOptions,
    logoImage: PDFImage | null,
    stampImage: PDFImage | null
  ): void {
    const title = opts.title ?? '問い合わせ一覧';
    const appTitle = opts.appTitle ?? '';
    const generatedAt = this.formatDateTime(new Date());

    const A4 = { w: 595.28, h: 841.89 };

    // 左右余白は同値で固定（右が詰まる事故を防ぐ）
    const marginL = 48;
    const marginR = 48;
    const marginTop = 48;
    const marginBottom = 52; // フッターのため少し確保

    const headerH = 72;
    const rowH = 18;
    const fontSize = 10;

    // ベース列幅（最終的に必ず availableW に収める）
    const colsBase = [
      { key: 'no', label: 'No', w: 38 },
      { key: 'subject', label: '件名', w: 210 },
      { key: 'customerName', label: '顧客名', w: 95 },
      { key: 'assignee', label: '担当者', w: 70 },
      { key: 'status', label: 'ステータス', w: 70 },
      { key: 'priority', label: '優先度', w: 50 },
      { key: 'createdAt', label: '作成日', w: 90 },
    ] as const;

    const availableW = A4.w - marginL - marginR;
    const cols = this.fitColumnsToWidth(colsBase, availableW);

    const tableW = cols.reduce((a, c) => a + c.w, 0);
    const tableRightX = marginL + tableW;

    // ページ番号を後で入れるため、ページ参照を保持
    const pages: PDFPage[] = [];

    const newPage = () => {
      const page = pdfDoc.addPage([A4.w, A4.h]);
      pages.push(page);

      let y = A4.h - marginTop;

      page.drawText(title, {
        x: marginL,
        y,
        size: 16,
        font,
        color: rgb(0.07, 0.09, 0.12),
      });

      if (appTitle) {
        page.drawText(appTitle, {
          x: marginL,
          y: y - 20,
          size: 9,
          font,
          color: rgb(0.35, 0.37, 0.4),
        });
      }

      // ロゴ（右端揃え）
      if (logoImage) {
        const maxW = 120;
        const maxH = 36;
        const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
        const w = logoImage.width * scale;
        const h = logoImage.height * scale;
        page.drawImage(logoImage, {
          x: tableRightX - w,
          y: y - 6,
          width: w,
          height: h,
          opacity: 0.95,
        });
      }

      // スタンプ（薄く）
      if (stampImage) {
        const size = 52;
        page.drawImage(stampImage, {
          x: tableRightX - size,
          y: y - 64,
          width: size,
          height: size,
          opacity: 0.14,
        });
      }

      // テーブルヘッダ
      const headerY = y - headerH;

      page.drawRectangle({
        x: marginL,
        y: headerY,
        width: tableW,
        height: 22,
        color: rgb(0.96, 0.97, 0.98),
      });

      page.drawRectangle({
        x: marginL,
        y: headerY,
        width: tableW,
        height: 22,
        borderColor: rgb(0.85, 0.87, 0.9),
        borderWidth: 1,
        color: rgb(1, 1, 1),
        opacity: 0,
      });

      let x = marginL;
      for (const c of cols) {
        page.drawText(c.label, {
          x: x + 4,
          y: headerY + 6,
          size: 9,
          font,
          color: rgb(0.3, 0.33, 0.36),
        });
        x += c.w;
      }

      y = headerY - 12;
      return { page, y };
    };

    let { page, y } = newPage();

    for (const t of tickets) {
      if (y - rowH < marginBottom) {
        ({ page, y } = newPage());
      }

      page.drawLine({
        start: { x: marginL, y: y - 4 },
        end: { x: marginL + tableW, y: y - 4 },
        thickness: 0.7,
        color: rgb(0.9, 0.91, 0.93),
      });

      const values: Record<string, string> = {
        no: String(t.no ?? ''),
        subject: String(t.subject ?? ''),
        customerName: String(t.customerName ?? ''),
        assignee: String(t.assignee ?? ''),
        status: String(t.status ?? ''),
        priority: String(t.priority ?? ''),
        createdAt: String(t.createdAt ?? ''),
      };

      /**
       * 重要:
       * - drawText の maxWidth は環境差で崩れたことがあるため使わない
       * - 一覧は「1セル=1行」で安定させるため、幅計測して … に落とす
       */
      let x = marginL;
      for (const c of cols) {
        const raw = values[c.key] ?? '';
        const clipped = this.clipToWidth(raw, font, fontSize, c.w - 8);
        page.drawText(clipped, {
          x: x + 4,
          y: y - 1,
          size: fontSize,
          font,
          color: rgb(0.1, 0.12, 0.16),
        });
        x += c.w;
      }

      y -= rowH;
    }

    // --- footer（page / total + generatedAt）---
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      this.drawFooter(pages[i], font, {
        pageW: A4.w,
        marginL,
        marginR,
        y: 22,
        leftText: generatedAt,
        rightText: `page ${i + 1} / ${totalPages}`,
      });
    }
  }

  /**
   * cols を “必ず” 指定幅に収める（= 右余白を壊さない）
   *
   * 実務メモ:
   * - tableW はヘッダ/罫線/ロゴ位置の基準。列合計が溢れると右余白が消える
   * - まず件名を優先的に削り、それでも無理なら最低幅を守りつつ比率縮小する
   */
  private fitColumnsToWidth<T extends ReadonlyArray<{ key: string; label: string; w: number }>>(
    base: T,
    targetWidth: number
  ): Array<{ key: T[number]['key']; label: string; w: number }> {
    const cols = base.map((c) => ({ ...c }));
    const sum = () => cols.reduce((a, c) => a + c.w, 0);

    // 1) まず件名を削る
    const subject = cols.find((c) => c.key === 'subject');
    if (subject) {
      const overflow = sum() - targetWidth;
      if (overflow > 0) {
        const minSubject = 120;
        const reducible = Math.max(0, subject.w - minSubject);
        const cut = Math.min(reducible, overflow);
        subject.w -= cut;
      }
    }

    // 2) まだ溢れるなら全体縮小（最低幅を守る）
    let overflow2 = sum() - targetWidth;
    if (overflow2 > 0) {
      const mins: Record<string, number> = {
        no: 32,
        subject: 110,
        customerName: 70,
        assignee: 55,
        status: 60,
        priority: 45,
        createdAt: 70,
      };

      const reducibles = cols.map((c) => ({
        c,
        reducible: Math.max(0, c.w - (mins[c.key] ?? 40)),
      }));
      const totalReducible = reducibles.reduce((a, r) => a + r.reducible, 0);

      if (totalReducible > 0) {
        const need = Math.min(overflow2, totalReducible);
        for (const r of reducibles) {
          if (r.reducible <= 0) continue;
          const portion = (r.reducible / totalReducible) * need;
          r.c.w = Math.max(mins[r.c.key] ?? 40, r.c.w - portion);
        }
      }

      overflow2 = sum() - targetWidth;
      if (overflow2 > 0 && subject) {
        subject.w = Math.max(110, subject.w - overflow2);
      }
    }

    // 3) 端数は丸め、合計ズレは件名に寄せて右端を揃える
    for (const c of cols) c.w = Math.round(c.w);

    const diff = sum() - targetWidth;
    if (diff !== 0) {
      const s = cols.find((c) => c.key === 'subject') ?? cols[0];
      s.w = Math.max(80, s.w - diff);
    }

    return cols;
  }

  // =========================
  // detail: 単票（デザイン再設計）
  // =========================
  private buildDetailPdf(
    pdfDoc: PDFDocument,
    font: PDFFont,
    tickets: Ticket[],
    opts: TicketPdfOptions,
    logoImage: PDFImage | null,
    stampImage: PDFImage | null
  ): void {
    const A4 = { w: 595.28, h: 841.89 };

    // 読み物としての余白（ここが詰まると“古い帳票感”が出る）
    const marginL = 52;
    const marginR = 52;
    const marginTop = 46;
    const marginBottom = 56; // フッターを確保

    const contentW = A4.w - marginL - marginR;

    const appTitle = opts.appTitle ?? '';
    const generatedAt = this.formatDateTime(new Date());
    const totalPages = tickets.length;

    for (let index = 0; index < tickets.length; index++) {
      const t = tickets[index];

      const page = pdfDoc.addPage([A4.w, A4.h]);
      let y = A4.h - marginTop;

      // ========= Header（情報を削って、整える）=========
      // 背景（少し濃く：0.96寄せ）
      this.drawHeaderBar(page, { x: 0, yTop: A4.h, w: A4.w, h: 98, shade: 0.96 });

      const title = opts.title ?? '問い合わせ詳細';
      page.drawText(title, {
        x: marginL,
        y: y + 8,
        size: 20,
        font,
        color: rgb(0.07, 0.09, 0.12),
      });

      // サブ（アプリ名だけ。日時はフッターに寄せる）
      if (appTitle) {
        page.drawText(appTitle, {
          x: marginL,
          y: y - 14,
          size: 10,
          font,
          color: rgb(0.34, 0.36, 0.4),
        });
      }

      // 右上：バッジ（No / ステータス / 優先度）
      const rightX = A4.w - marginR;
      let pillX = rightX - 10;

      const no = String(t.no ?? '');
      const noText = `#${no || '-'}`;
      pillX -= font.widthOfTextAtSize(noText, 9) + 16;
      this.drawPill(page, font, {
        x: pillX,
        y: y + 6,
        text: noText,
        size: 9,
        bg: { r: 0.93, g: 0.94, b: 0.96 },
        fg: { r: 0.2, g: 0.22, b: 0.26 },
      });
      pillX -= 8;

      const st = this.statusTheme(String(t.status ?? ''));
      const stText = `ステータス: ${String(t.status ?? '')}`;
      pillX -= font.widthOfTextAtSize(stText, 9) + 16;
      this.drawPill(page, font, {
        x: pillX,
        y: y + 6,
        text: stText,
        size: 9,
        bg: st.bg,
        fg: st.fg,
      });
      pillX -= 8;

      const pr = this.priorityTheme(String(t.priority ?? ''));
      const prText = `優先度: ${String(t.priority ?? '')}`;
      pillX -= font.widthOfTextAtSize(prText, 9) + 16;
      this.drawPill(page, font, {
        x: pillX,
        y: y + 6,
        text: prText,
        size: 9,
        bg: pr.bg,
        fg: pr.fg,
      });

      // ロゴ（右上・任意）
      if (logoImage) {
        const maxW = 92;
        const maxH = 26;
        const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
        const w = logoImage.width * scale;
        const h = logoImage.height * scale;
        page.drawImage(logoImage, {
          x: A4.w - marginR - w,
          y: A4.h - 34,
          width: w,
          height: h,
          opacity: 0.9,
        });
      }

      y -= 72;

      // ========= Card: 基本情報 =========
      const metaCardH = 170;
      this.drawCard(page, { x: marginL, yTop: y, w: contentW, h: metaCardH });

      this.drawSectionTitle(page, font, {
        x: marginL + 16,
        y: y - 18,
        text: '基本情報',
      });

      // 2カラム + “ラベル小さめ / 値大きめ” を徹底
      const colGap = 18;
      const colW = (contentW - colGap) / 2;
      const leftX = marginL + 16;
      const rightXCol = leftX + colW + colGap;

      // 行の設計（各ブロックは高さ固定で「詰まり」を防ぐ）
      const blockTop = y - 44;
      const blockH = 56;

      // 左上：件名（最大2行）
      this.drawLabelValueBlock(page, font, {
        x: leftX,
        yTop: blockTop,
        w: colW,
        label: '件名',
        value: String(t.subject ?? ''),
        valueSize: 12,
        maxLines: 2,
      });

      // 右上：顧客名（最大2行）
      this.drawLabelValueBlock(page, font, {
        x: rightXCol,
        yTop: blockTop,
        w: colW,
        label: '顧客名',
        value: String(t.customerName ?? ''),
        valueSize: 12,
        maxLines: 2,
      });

      // 下段
      this.drawLabelValueBlock(page, font, {
        x: leftX,
        yTop: blockTop - blockH,
        w: colW,
        label: '担当者',
        value: String(t.assignee ?? ''),
        valueSize: 12,
        maxLines: 1,
      });

      this.drawLabelValueBlock(page, font, {
        x: rightXCol,
        yTop: blockTop - blockH,
        w: colW,
        label: '作成日 / 更新日',
        value: `${String(t.createdAt ?? '')} / ${String(t.updatedAt ?? '')}`,
        valueSize: 11,
        maxLines: 1,
      });

      // 補助線（カードに“締まり”を出す。線は薄く）
      page.drawLine({
        start: { x: marginL + 16, y: y - 44 - blockH + 10 },
        end: { x: marginL + contentW - 16, y: y - 44 - blockH + 10 },
        thickness: 0.7,
        color: rgb(0.93, 0.94, 0.96),
      });

      y -= metaCardH + 18;

      // ========= Card: 問い合わせ内容 =========
      const bodyTop = y;
      const bodyH = Math.max(380, bodyTop - marginBottom);
      this.drawCard(page, { x: marginL, yTop: bodyTop, w: contentW, h: bodyH });

      this.drawSectionTitle(page, font, {
        x: marginL + 16,
        y: bodyTop - 18,
        text: '問い合わせ内容',
      });

      // 本文（余白多め・読みやすさ優先）
      const innerX = marginL + 16;
      const innerW = contentW - 32;
      const innerTop = bodyTop - 44;
      const innerBottom = bodyTop - bodyH + 16;

      const body = String(t.body ?? '');
      const lines = this.wrapText(body, font, 11, innerW);

      let yy = innerTop;
      const lineH = 16;

      for (const line of lines) {
        if (yy < innerBottom) break;
        page.drawText(line, {
          x: innerX,
          y: yy,
          size: 11,
          font,
          color: rgb(0.1, 0.12, 0.16),
        });
        yy -= lineH;
      }

      // スタンプ（任意：透かし）
      if (stampImage) {
        const size = 74;
        page.drawImage(stampImage, {
          x: A4.w - marginR - size,
          y: marginBottom + 14,
          width: size,
          height: size,
          opacity: 0.07,
        });
      }

      // ========= Footer =========
      this.drawFooter(page, font, {
        pageW: A4.w,
        marginL,
        marginR,
        y: 22,
        leftText: `出力: ${generatedAt}`,
        rightText: `page ${index + 1} / ${totalPages}`,
      });
    }
  }

  // =========================
  // UI helpers（見た目）
  // =========================

  /**
   * カード枠（白背景 + 薄いボーダー）
   * - 帳票は線を増やすより、余白と階層（サイズ差）で見せる方が読みやすい
   */
  private drawCard(page: PDFPage, p: { x: number; yTop: number; w: number; h: number }) {
    page.drawRectangle({
      x: p.x,
      y: p.yTop - p.h,
      width: p.w,
      height: p.h,
      borderWidth: 1,
      borderColor: rgb(0.9, 0.92, 0.94),
      color: rgb(1, 1, 1),
      opacity: 1,
    });
  }

  /**
   * ヘッダーバー（淡い背景）
   * - “面” を作るだけで帳票全体の印象が整う
   */
  private drawHeaderBar(
    page: PDFPage,
    p: { x: number; yTop: number; w: number; h: number; shade?: number }
  ) {
    const s = p.shade ?? 0.97; // 0.95〜0.97あたりが“濃すぎず薄すぎず”
    page.drawRectangle({
      x: p.x,
      y: p.yTop - p.h,
      width: p.w,
      height: p.h,
      color: rgb(s, s, s),
      opacity: 1,
    });
  }

  /** セクション見出し（カード内の “章タイトル”） */
  private drawSectionTitle(
    page: PDFPage,
    font: PDFFont,
    p: { x: number; y: number; text: string }
  ) {
    page.drawText(p.text, {
      x: p.x,
      y: p.y,
      size: 11,
      font,
      color: rgb(0.2, 0.22, 0.26),
    });

    // 小さなアクセント線（過剰にしない）
    page.drawLine({
      start: { x: p.x, y: p.y - 10 },
      end: { x: p.x + 56, y: p.y - 10 },
      thickness: 1,
      color: rgb(0.92, 0.93, 0.95),
    });
  }

  /**
   * ラベル + 値のブロック（2カラム用）
   * - 値は wrap を許可（最大 maxLines）
   * - 超える場合は最後を … でクリップ
   */
  private drawLabelValueBlock(
    page: PDFPage,
    font: PDFFont,
    p: {
      x: number;
      yTop: number;
      w: number;
      label: string;
      value: string;
      valueSize: number;
      maxLines: number;
    }
  ) {
    const labelSize = 9;
    const labelColor = rgb(0.45, 0.48, 0.52);
    const valueColor = rgb(0.1, 0.12, 0.16);

    // label
    page.drawText(p.label, {
      x: p.x,
      y: p.yTop,
      size: labelSize,
      font,
      color: labelColor,
    });

    const maxValueW = p.w;
    const raw = String(p.value ?? '');
    const lines = this.wrapText(raw, font, p.valueSize, maxValueW);

    const lineH = p.valueSize + 4;
    const max = Math.max(1, p.maxLines);

    // 値は “最大 maxLines”
    const shown = lines.slice(0, max);

    // 行数を超える場合、最終行を … に寄せてクリップ
    if (lines.length > max) {
      const last = shown[shown.length - 1] ?? '';
      shown[shown.length - 1] = this.clipToWidth(last, font, p.valueSize, maxValueW);
    }

    let yy = p.yTop - 16;
    for (const line of shown) {
      page.drawText(line || '-', {
        x: p.x,
        y: yy,
        size: p.valueSize,
        font,
        color: valueColor,
      });
      yy -= lineH;
    }
  }

  /**
   * バッジ（pill風）
   * - pdf-lib は角丸Rectが無いので、薄い背景 + 小さい高さで “それっぽさ” を出す
   */
  private drawPill(
    page: PDFPage,
    font: PDFFont,
    p: {
      x: number;
      y: number;
      text: string;
      size: number;
      padX?: number;
      padY?: number;
      bg: { r: number; g: number; b: number };
      fg: { r: number; g: number; b: number };
    }
  ) {
    const padX = p.padX ?? 8;
    const padY = p.padY ?? 4;

    const textW = font.widthOfTextAtSize(p.text, p.size);
    const w = textW + padX * 2;
    const h = p.size + padY * 2;

    page.drawRectangle({
      x: p.x,
      y: p.y - h + 2,
      width: w,
      height: h,
      color: rgb(p.bg.r, p.bg.g, p.bg.b),
      opacity: 1,
    });

    page.drawText(p.text, {
      x: p.x + padX,
      y: p.y - p.size - padY + 4,
      size: p.size,
      font,
      color: rgb(p.fg.r, p.fg.g, p.fg.b),
    });

    return { w, h };
  }

  /** フッター（左：出力日時、右：ページ番号） */
  private drawFooter(
    page: PDFPage,
    font: PDFFont,
    p: {
      pageW: number;
      marginL: number;
      marginR: number;
      y: number;
      leftText: string;
      rightText: string;
    }
  ) {
    const size = 9;
    const color = rgb(0.45, 0.48, 0.52);

    // 上に薄い区切り線（“書類感”）
    page.drawLine({
      start: { x: p.marginL, y: p.y + 12 },
      end: { x: p.pageW - p.marginR, y: p.y + 12 },
      thickness: 0.7,
      color: rgb(0.93, 0.94, 0.96),
    });

    page.drawText(p.leftText, {
      x: p.marginL,
      y: p.y,
      size,
      font,
      color,
    });

    const rightW = font.widthOfTextAtSize(p.rightText, size);
    page.drawText(p.rightText, {
      x: p.pageW - p.marginR - rightW,
      y: p.y,
      size,
      font,
      color,
    });
  }

  /** ステータスの色味（印刷/スクショでも破綻しにくい薄色） */
  private statusTheme(status: string) {
    switch (status) {
      case '完了':
        return { bg: { r: 0.9, g: 0.98, b: 0.93 }, fg: { r: 0.11, g: 0.45, b: 0.22 } };
      case '対応中':
        return { bg: { r: 0.92, g: 0.96, b: 1.0 }, fg: { r: 0.12, g: 0.29, b: 0.55 } };
      default: // 受付
        return { bg: { r: 0.96, g: 0.96, b: 0.96 }, fg: { r: 0.35, g: 0.37, b: 0.4 } };
    }
  }

  /** 優先度の色味（薄色） */
  private priorityTheme(priority: string) {
    switch (priority) {
      case '高':
        return { bg: { r: 1.0, g: 0.93, b: 0.93 }, fg: { r: 0.6, g: 0.12, b: 0.12 } };
      case '低':
        return { bg: { r: 0.94, g: 0.99, b: 0.94 }, fg: { r: 0.16, g: 0.45, b: 0.2 } };
      default: // 中
        return { bg: { r: 1.0, g: 0.97, b: 0.9 }, fg: { r: 0.55, g: 0.35, b: 0.1 } };
    }
  }

  // =========================
  // helpers（テキスト）
  // =========================

  /**
   * 日本語も崩れにくい自前 wrap（改行も尊重）
   *
   * 実務メモ:
   * - 文字単位で幅計測して折り返す（欧文の単語境界には未対応だが帳票用途なら十分）
   * - \r\n / \n の段落を維持（貼り付け文章の視認性が上がる）
   */
  private wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const src = String(text ?? '');
    if (!src) return [''];

    const out: string[] = [];
    const paragraphs = src.replace(/\r\n/g, '\n').split('\n');

    for (const para of paragraphs) {
      if (para === '') {
        out.push('');
        continue;
      }

      let line = '';
      for (const ch of Array.from(para)) {
        const next = line + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          line = next;
          continue;
        }
        if (line) out.push(line);
        line = ch;
      }
      if (line) out.push(line);
    }

    return out;
  }

  /** 1行に収めて …（幅計測で安定） */
  private clipToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
    const s = String(text ?? '');
    if (!s) return '';
    if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;

    const ellipsis = '…';
    let lo = 0;
    let hi = s.length;

    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = s.slice(0, mid) + ellipsis;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo) + ellipsis;
  }

  /** 帳票向けの日時（ISOのT/Zを避けて読みやすく） */
  private formatDateTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }

  // =========================
  // helpers（I/O）
  // =========================
  private normalizeUrl(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/')) return url;
    return `/${url}`;
  }

  private normalizeUrlOrNull(url: string | null): string | null {
    return url ? this.normalizeUrl(url) : null;
  }

  private async tryLoadTtf(pdfDoc: PDFDocument, url: string): Promise<PDFFont> {
    try {
      const buf = await this.fetchArrayBuffer(url);

      /**
       * フォント崩れ対策:
       * - subset:true は環境差で幅計測ズレ/文字化けが出るケースがある
       * - 帳票ではファイルサイズより再現性優先で subset:false を推奨
       */
      return await pdfDoc.embedFont(buf, { subset: false });
    } catch {
      // フォント取得に失敗しても処理を止めない（日本語は出ない）
      return await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
  }

  private async tryLoadImage(pdfDoc: PDFDocument, url: string | null): Promise<PDFImage | null> {
    if (!url) return null;
    try {
      const buf = await this.fetchArrayBuffer(url);
      try {
        return await pdfDoc.embedPng(buf);
      } catch {
        return await pdfDoc.embedJpg(buf);
      }
    } catch {
      return null;
    }
  }

  private async fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    // 開発中に差し替えた font/logo がキャッシュで掴まると事故るので no-cache を明示
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
    return await res.arrayBuffer();
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
