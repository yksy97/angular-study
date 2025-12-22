import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { Priority } from './ticket-store.service';

export type ImportError = { line: number; message: string };

export type TicketInput = {
  subject: string;
  body: string;
  customerName: string;
  priority: Priority;
  assignee: string;
};

export type ImportResult =
  | { ok: true; inputs: TicketInput[] }
  | { ok: false; errors: ImportError[] };

const MAX_ROWS = 5000;

// 期待するCSVヘッダ（固定）
const REQUIRED_HEADERS = ['subject', 'body', 'customerName', 'priority', 'assignee'] as const;

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .replace(/^\uFEFF/, '') // BOM混入対策
    .toLowerCase();
}

function asString(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizePriority(v: string): Priority | null {
  if (!v) return '中';
  if (v === '高' || v === '中' || v === '低') return v;
  return null;
}

@Injectable({ providedIn: 'root' })
export class TicketCsvImportService {
  async importCsv(file: File): Promise<ImportResult> {
    // 拡張子/タイプはブラウザで揺れるので「厳密に弾かない」方が実務的
    if (!file) {
      return { ok: false, errors: [{ line: 0, message: 'ファイルが選択されていません' }] };
    }

    const parsed = await this.parseWithPapa(file);

    // パース自体のエラー（引用符崩れ等）
    if (parsed.errors.length > 0) {
      const errs: ImportError[] = parsed.errors.map((e) => ({
        line: (e.row ?? 0) + 2, // header:true の row はデータ行基準。見せる行は概ね +2
        message: e.message || 'CSVの解析に失敗しました',
      }));
      return { ok: false, errors: errs };
    }

    // ヘッダチェック（不足/誤りの早期発見）
    const headers = (parsed.meta.fields ?? []).map(normalizeHeader);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      return {
        ok: false,
        errors: [
          {
            line: 1,
            message: `CSVヘッダが不足しています: ${missing.join(', ')}`,
          },
        ],
      };
    }

    const rows = parsed.data ?? [];

    // 行数上限
    if (rows.length > MAX_ROWS) {
      return {
        ok: false,
        errors: [
          {
            line: 0,
            message: `行数が上限（${MAX_ROWS}行）を超えています（現在: ${rows.length}行）`,
          },
        ],
      };
    }

    // バリデーション（1行でもNGなら全件中止）
    const errors: ImportError[] = [];
    const inputs: TicketInput[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] as Record<string, unknown>;
      const line = i + 2; // 1行目ヘッダなので +2（表示用）

      const subject = asString(raw['subject']);
      const body = asString(raw['body']);
      const customerName = asString(raw['customerName']);
      const priorityRaw = asString(raw['priority']);
      const assignee = asString(raw['assignee']);

      if (!subject) errors.push({ line, message: 'subject（件名）が空です' });
      if (!body) errors.push({ line, message: 'body（内容）が空です' });

      const pr = normalizePriority(priorityRaw);
      if (pr === null) {
        errors.push({ line, message: 'priority は「高 / 中 / 低」のいずれかです' });
      }

      // エラーがある行は inputs に入れない（全件中止方針だが、集計のため）
      if (errors.some((e) => e.line === line)) continue;

      inputs.push({
        subject,
        body,
        customerName,
        priority: pr ?? '中',
        assignee,
      });
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, inputs };
  }

  private parseWithPapa(file: File): Promise<Papa.ParseResult<Record<string, unknown>>> {
    return new Promise((resolve) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        transformHeader: (h) => normalizeHeader(h),
        // 値は一旦そのまま。trim等は validate/transform でやる
        complete: (result) => resolve(result),
      });
    });
  }
}
