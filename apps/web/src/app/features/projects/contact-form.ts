import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { isValidItalianFiscalId } from '@aph/contracts';
import {
  CONTACT_KIND_LABEL,
  CONTACT_ROLE_LABEL,
  type Contact,
  type ContactInput,
  type ContactKind,
  type ContactRole,
} from '../../core/api/projects-api';
import { val } from '../../shared/dom';

/** Bozza del committente modificata nel form (stringhe vuote = campo non compilato). */
export interface ContactDraft {
  kind: ContactKind;
  displayName: string;
  email: string;
  phone: string;
  taxId: string;
  roleInProject: ContactRole | '';
  isSigner: boolean;
  portalEnabled: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyContact = (isSigner = true): ContactDraft => ({
  kind: 'PERSON', displayName: '', email: '', phone: '', taxId: '', roleInProject: 'OWNER', isSigner, portalEnabled: true,
});

export const contactToDraft = (c: Contact): ContactDraft => ({
  kind: c.kind, displayName: c.displayName, email: c.email, phone: c.phone ?? '', taxId: c.taxId ?? '',
  roleInProject: c.roleInProject ?? '', isSigner: c.isSigner, portalEnabled: c.portalEnabled,
});

export function contactErrors(d: ContactDraft): { displayName?: string; email?: string; taxId?: string } {
  return {
    ...(d.displayName.trim().length < 2 ? { displayName: 'Indica nome e cognome o la ragione sociale.' } : {}),
    ...(!EMAIL_RE.test(d.email.trim()) ? { email: 'Email non valida.' } : {}),
    ...(d.taxId.trim() && !isValidItalianFiscalId(d.taxId.trim().toUpperCase()) ? { taxId: 'Codice fiscale o partita IVA non valido.' } : {}),
  };
}

export const isContactValid = (d: ContactDraft): boolean => Object.keys(contactErrors(d)).length === 0;

export function draftToInput(d: ContactDraft): ContactInput {
  return {
    kind: d.kind,
    displayName: d.displayName.trim(),
    email: d.email.trim().toLowerCase(),
    phone: d.phone.trim() || null,
    taxId: d.taxId.trim().toUpperCase() || null,
    roleInProject: d.roleInProject || null,
    isSigner: d.isSigner,
    portalEnabled: d.portalEnabled,
  };
}

/** Dati del committente (AFU FR-M1-03): anagrafica, ruolo, firmatario, accesso al portale. */
@Component({
  selector: 'app-contact-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-2">
      <div class="field"><label [for]="id('kind')">Tipo</label>
        <select [id]="id('kind')" class="select" [value]="value().kind" (change)="patch({ kind: $any(val($event)) })">
          @for (k of kinds; track k) { <option [value]="k" [selected]="k === value().kind">{{ kindLabel[k] }}</option> }
        </select>
      </div>
      <div class="field"><label [for]="id('role')">Ruolo nella commessa</label>
        <select [id]="id('role')" class="select" [value]="value().roleInProject" (change)="patch({ roleInProject: $any(val($event)) })">
          <option value="" [selected]="!value().roleInProject">—</option>
          @for (r of roles; track r) { <option [value]="r" [selected]="r === value().roleInProject">{{ roleLabel[r] }}</option> }
        </select>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="field"><label [for]="id('name')">{{ value().kind === 'PERSON' ? 'Nome e cognome' : 'Ragione sociale' }}</label>
        <input [id]="id('name')" class="input" [class.is-invalid]="touched() && errors().displayName" [value]="value().displayName" (input)="patch({ displayName: val($event) })" />
      </div>
      <div class="field"><label [for]="id('email')">Email</label>
        <input [id]="id('email')" class="input" type="email" autocomplete="off" [class.is-invalid]="touched() && errors().email" [value]="value().email" (input)="patch({ email: val($event) })" />
        @if (touched() && errors().email) { <span class="hint is-error">{{ errors().email }}</span> }
      </div>
    </div>
    <div class="grid grid-2">
      <div class="field"><label [for]="id('phone')">Telefono <span class="muted">(facoltativo)</span></label>
        <input [id]="id('phone')" class="input" type="tel" [value]="value().phone" (input)="patch({ phone: val($event) })" />
      </div>
      <div class="field"><label [for]="id('tax')">Codice fiscale / P.IVA <span class="muted">(facoltativo)</span></label>
        <input [id]="id('tax')" class="input mono" maxlength="16" [class.is-invalid]="errors().taxId" [value]="value().taxId" (input)="patch({ taxId: val($event) })" />
        @if (errors().taxId) { <span class="hint is-error">{{ errors().taxId }}</span> }
      </div>
    </div>
    <div class="checks">
      <label class="check"><input type="checkbox" [checked]="value().isSigner" (change)="patch({ isSigner: checked($event) })" />
        <span><b>Firmatario</b>: può approvare le tavole con codice OTP</span></label>
      <label class="check"><input type="checkbox" [checked]="value().portalEnabled" (change)="patch({ portalEnabled: checked($event) })" />
        <span><b>Accesso al portale</b> con link personale, senza password</span></label>
    </div>
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .checks { display: grid; gap: 8px; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; }
    .check input { margin-top: 3px; }
    .hint.is-error { color: var(--danger); }
  `,
})
export class ContactForm {
  readonly value = model.required<ContactDraft>();
  /** Mostra gli errori obbligatori solo dopo il primo tentativo di invio. */
  readonly touched = input(false);
  /** Prefisso per gli id dei campi quando il form compare più volte nella pagina. */
  readonly prefix = input('contact');

  protected readonly val = val;
  protected readonly kinds = Object.keys(CONTACT_KIND_LABEL) as ContactKind[];
  protected readonly roles = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[];
  protected readonly kindLabel = CONTACT_KIND_LABEL;
  protected readonly roleLabel = CONTACT_ROLE_LABEL;

  protected errors() {
    return contactErrors(this.value());
  }

  protected id(name: string): string {
    return `${this.prefix()}-${name}`;
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected patch(p: Partial<ContactDraft>): void {
    this.value.update((v) => ({ ...v, ...p }));
  }
}
