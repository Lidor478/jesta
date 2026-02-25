/**
 * @file morning.client.ts
 * @description Israeli חשבונית ירוקה (Green Invoice) generation via Morning API.
 *
 * Morning (morning.co.il) is an Israeli accounting SaaS used for:
 *  - חשבוניות מס (Tax invoices) with 17% VAT
 *  - קבלות (Receipts)
 *  - PDF generation + email delivery
 *
 * @fallback In dev/test mode (MORNING_API_KEY not set), returns a stub invoice.
 * @compliance All Jesta transactions above 0 NIS require a חשבונית ירוקה per Israeli tax law.
 * @compliance VAT (מע"מ) is 17% of Jesta's commission revenue (not of the full task price).
 *
 * API Docs: https://api.greeninvoice.co.il/api-docs/
 *
 * APPROVAL GATE: Invoice structure, VAT calculation, or provider changes require
 * re-approval per CLAUDE.md before deployment.
 */

import fetch from 'node-fetch';
import { FEES } from '../config/constants';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface InvoiceData {
  clientName: string;
  clientPhone: string;
  jesterName: string;
  taskDescription: string;
  agreedPrice: number;
  jestaCommission: number;   // clientCommission + jesterCommission
  vatAmount: number;         // 17% of jestaCommission
  grossAmount: number;       // total client paid
  issuedAt: Date;
}

export interface CreatedInvoice {
  /** Internal DB id (will be set after prisma.invoice.create) */
  id: string;
  /** Morning's own invoice ID */
  externalId: string;
  /** Human-readable invoice number e.g. "INV-2024-001234" */
  number: string;
  /** URL to download PDF */
  pdfUrl: string;
  /** Raw Morning API response */
  raw?: unknown;
}

// Morning API document types
const MORNING_DOCUMENT_TYPE = {
  TAX_INVOICE: 320,      // חשבונית מס
  TAX_RECEIPT: 400,      // חשבונית מס קבלה (invoice + receipt combined)
  RECEIPT: 500,          // קבלה
} as const;

// ─────────────────────────────────────────────
// Morning API Client
// ─────────────────────────────────────────────

export class MorningClient {
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly baseUrl = 'https://api.greeninvoice.co.il/api/v1';
  private readonly isDev: boolean;

  constructor() {
    this.apiKey = process.env.MORNING_API_KEY;
    this.apiSecret = process.env.MORNING_API_SECRET;
    this.isDev = !this.apiKey;

    if (this.isDev) {
      console.warn('[MORNING] No API key found — using stub mode. Set MORNING_API_KEY in .env');
    }
  }

  // ─────────────────────────────
  // Auth: Get JWT token from Morning
  // ─────────────────────────────

  private async authenticate(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/account/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.apiKey,
        secret: this.apiSecret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Morning auth failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { token: string };
    return data.token;
  }

  // ─────────────────────────────
  // Create חשבונית מס קבלה
  // ─────────────────────────────

  /**
   * @description Generate Israeli tax invoice (חשבונית מס קבלה) for a completed Jesta task.
   *
   * The invoice is issued by Jesta Ltd. for its commission service.
   * Line items:
   *   1. "שירות תיווך - {taskDescription}" — jestaCommission (pre-VAT)
   *   2. "מע"מ 17%" — vatAmount
   *
   * The full task price (agreedPrice) is NOT on Jesta's invoice — that's between client and jester.
   *
   * @hebrew חשבונית מס קבלה לעמלת תיווך בלבד, לא על מחיר המשימה המלא
   * @compliance VAT = 17% of Jesta's commission only (per Israeli tax authority rules)
   */
  async createInvoice(data: InvoiceData): Promise<CreatedInvoice> {
    if (this.isDev) {
      return this.stubInvoice(data);
    }

    const token = await this.authenticate();

    const commissionPreVat = data.jestaCommission - data.vatAmount;

    const payload = {
      // Document type: חשבונית מס קבלה (invoice + receipt)
      type: MORNING_DOCUMENT_TYPE.TAX_RECEIPT,
      lang: 'he',
      currency: 'ILS',
      vatType: 0, // 0 = regular VAT included in prices

      // Client details on invoice
      client: {
        name: data.clientName,
        phone: data.clientPhone.replace(/[^\d]/g, ''), // digits only
        add: false, // don't add to Morning contacts
      },

      // Income line items — only Jesta's commission
      income: [
        {
          description: `שירות תיווך — ${data.taskDescription}`,
          quantity: 1,
          price: commissionPreVat,
          currency: 'ILS',
          vatType: 0,
        },
      ],

      // Issue date
      date: data.issuedAt.toISOString().split('T')[0],

      // Additional metadata (internal reference, not shown on invoice)
      remarks: `ג׳סטה — מחיר מוסכם ₪${data.agreedPrice} | ג׳סטר: ${data.jesterName}`,
    };

    const res = await fetch(`${this.baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Morning createInvoice failed: ${res.status} ${err}`);
    }

    const result = (await res.json()) as {
      id: string;
      number: string;
      url: string;
    };

    return {
      id: '',  // set by caller after DB insert
      externalId: result.id,
      number: result.number,
      pdfUrl: result.url,
      raw: result,
    };
  }

  // ─────────────────────────────
  // Get invoice PDF URL (re-fetch if URL expired)
  // ─────────────────────────────

  async getInvoicePdfUrl(externalId: string): Promise<string> {
    if (this.isDev) {
      return `https://stub.morning.co.il/invoices/${externalId}/download.pdf`;
    }

    const token = await this.authenticate();

    const res = await fetch(`${this.baseUrl}/documents/${externalId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Morning getInvoice failed: ${res.status}`);

    const result = (await res.json()) as { url: string };
    return result.url;
  }

  // ─────────────────────────────
  // Stub for dev/test mode
  // ─────────────────────────────

  /**
   * @description Returns a realistic stub invoice for dev/staging environments.
   * @hebrew מצב פיתוח — חשבונית מדומה
   */
  private stubInvoice(data: InvoiceData): CreatedInvoice {
    const stubNumber = `INV-STUB-${Date.now()}`;
    const stubId = `stub_${Math.random().toString(36).slice(2, 10)}`;

    console.log(`[MORNING STUB] Generating stub invoice for task: "${data.taskDescription}"`);
    console.log(`  Client: ${data.clientName} | Commission: ₪${data.jestaCommission} | VAT: ₪${data.vatAmount}`);

    return {
      id: '',
      externalId: stubId,
      number: stubNumber,
      pdfUrl: `https://stub.morning.co.il/invoices/${stubId}/download.pdf`,
      raw: {
        _stub: true,
        data,
        vatRate: FEES.VAT_RATE,
        issuedAt: data.issuedAt.toISOString(),
      },
    };
  }
}

// ─────────────────────────────────────────────
// iCount fallback client (alternative Israeli invoicing provider)
// ─────────────────────────────────────────────

/**
 * @description Fallback to iCount if Morning is unavailable.
 * iCount supports full Hebrew RTL invoices with Israeli bank transfer details.
 *
 * @note Currently stub-only. Activate if Morning SLA drops below 99.5%.
 */
export class ICountClient {
  private readonly apiUrl = 'https://api.icount.co.il/api/v3.php';
  private readonly companyId = process.env.ICOUNT_COMPANY_ID;
  private readonly username = process.env.ICOUNT_USERNAME;
  private readonly password = process.env.ICOUNT_PASSWORD;

  async createInvoice(data: InvoiceData): Promise<CreatedInvoice> {
    if (!this.companyId) {
      console.warn('[ICOUNT] Not configured — skipping fallback invoice');
      return {
        id: '',
        externalId: `icount_stub_${Date.now()}`,
        number: `ICOUNT-STUB-${Date.now()}`,
        pdfUrl: '',
      };
    }

    // iCount uses form-encoded API
    const params = new URLSearchParams({
      cid: this.companyId,
      user: this.username ?? '',
      pass: this.password ?? '',
      cmd: 'create_doc',
      doc_type: 'invrec',  // חשבונית מס קבלה
      client_name: data.clientName,
      client_phone: data.clientPhone,
      total: String(data.jestaCommission),
      vat: String(data.vatAmount),
      description: `שירות תיווך ג׳סטה — ${data.taskDescription}`,
    });

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      body: params,
    });

    const result = (await res.json()) as { doc_num: string; doc_url: string; status: boolean };

    if (!result.status) throw new Error('iCount createInvoice failed');

    return {
      id: '',
      externalId: result.doc_num,
      number: result.doc_num,
      pdfUrl: result.doc_url,
    };
  }
}
