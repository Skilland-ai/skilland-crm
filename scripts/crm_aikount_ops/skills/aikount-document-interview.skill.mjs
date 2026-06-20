import { agentArtifact, issue } from '../kernel/contracts.mjs';
import {
  defaultDocumentKey,
  parseDecimal,
  parseEmailList,
  todayIso,
} from '../kernel/interviewer.mjs';
import { documentKindForAction } from '../kernel/document-selection.mjs';

export async function runAikountDocumentInterviewSkill({
  request,
  crmSnapshot,
  masterData,
  selection,
  targetDocument,
  interviewer = null,
}) {
  const interviewData = {
    warnings: [...(selection.warnings ?? [])],
    blockingIssues: [...(selection.blockingIssues ?? [])],
    documentKey: request.answers?.documentKey ?? selection.selectedMapping?.documentKey ?? null,
    invoiceDocumentKey: request.answers?.invoiceDocumentKey ?? null,
    docDate: request.answers?.document?.docDate ?? null,
    dueDate: request.answers?.document?.dueDate ?? null,
    currency: request.answers?.document?.currency ?? crmSnapshot.currencyCode ?? 'EUR',
    headerDiscountPct: request.answers?.document?.headerDiscountPct ?? null,
    notes: request.answers?.document?.notes ?? null,
    seriesId: request.answers?.document?.seriesId ?? null,
    lines: normalizeLines(request.answers?.lines ?? []),
    send: normalizeSend(request.answers?.send ?? {}),
    followUpActions: normalizeFollowUpActions(request.answers?.followUpActions ?? []),
    contact: normalizeContactOverrides(request.answers?.contact ?? {}),
  };

  if (interviewer) {
    await enrichInterviewInteractively({
      interviewer,
      request,
      crmSnapshot,
      masterData,
      selection,
      targetDocument,
      interviewData,
    });
  }

  validateInterviewData({ request, interviewData, targetDocument });

  return agentArtifact({
    agent: 'aikount_document_interview_skill',
    status: interviewData.blockingIssues.length ? 'blocked' : 'completed',
    warnings: interviewData.warnings,
    blockingIssues: interviewData.blockingIssues,
    interviewData,
  });
}

async function enrichInterviewInteractively({
  interviewer,
  request,
  crmSnapshot,
  masterData,
  selection,
  targetDocument,
  interviewData,
}) {
  const action = request.action;
  const documentKind = documentKindForAction(action);
  const taxes = masterData.taxes ?? [];
  const numbering = masterData.numbering ?? [];

  if (action === 'create_quote' || action === 'create_invoice') {
    interviewData.documentKey =
      interviewData.documentKey ??
      (await interviewer.ask('Document key local para este documento:', {
        defaultValue: defaultDocumentKey(),
      }));
    interviewData.docDate =
      interviewData.docDate ??
      (await interviewer.ask('Fecha del documento (YYYY-MM-DD):', {
        defaultValue: todayIso(),
      }));
    interviewData.dueDate =
      interviewData.dueDate ??
      (await interviewer.ask('Fecha de vencimiento (opcional):', {
        defaultValue: '',
      }));
    interviewData.headerDiscountPct =
      interviewData.headerDiscountPct ??
      parseOptionalDecimal(
        await interviewer.ask('Descuento cabecera % (opcional):', {
          defaultValue: '0',
        }),
      );
    interviewData.notes =
      interviewData.notes ??
      (await interviewer.ask('Notas del documento (opcional):', {
        defaultValue: '',
      }));
    interviewData.seriesId =
      interviewData.seriesId ??
      (await chooseSeries({ interviewer, numbering, documentKind }));
    await enrichContactOverrides({ interviewer, crmSnapshot, interviewData });
    if (!interviewData.lines.length) {
      interviewData.lines = await collectLines({
        interviewer,
        crmSnapshot,
        taxes,
      });
    }

    if (action === 'create_quote') {
      if (await interviewer.confirm('Quieres enviarlo justo despues de crearlo?', { defaultValue: false })) {
        interviewData.followUpActions.push('send_quote');
      }
    } else if (await interviewer.confirm('Quieres emitir la factura despues de crearla?', { defaultValue: true })) {
      interviewData.followUpActions.push('issue_invoice');
      if (await interviewer.confirm('Quieres compartir la factura despues de emitirla?', { defaultValue: false })) {
        interviewData.followUpActions.push('share_invoice');
      }
      if (await interviewer.confirm('Quieres enviarla por email despues de emitirla?', { defaultValue: false })) {
        interviewData.followUpActions.push('send_invoice');
        interviewData.send = await collectInvoiceSendOptions({ interviewer });
      }
    }
  }

  if (action === 'update_quote' || action === 'update_invoice') {
    interviewData.docDate = await askKeepOrReplace({
      interviewer,
      label: 'Nueva fecha de documento',
      currentValue: targetDocument?.doc_date ?? null,
      currentChoice: interviewData.docDate,
    });
    interviewData.dueDate = await askKeepOrReplace({
      interviewer,
      label: 'Nueva fecha de vencimiento',
      currentValue: targetDocument?.due_date ?? null,
      currentChoice: interviewData.dueDate,
    });
    interviewData.notes = await askKeepOrReplace({
      interviewer,
      label: 'Nuevas notas',
      currentValue: targetDocument?.notes ?? null,
      currentChoice: interviewData.notes,
    });
    if (await interviewer.confirm('Quieres reemplazar las lineas del documento?', { defaultValue: false })) {
      interviewData.lines = await collectLines({
        interviewer,
        crmSnapshot,
        taxes,
      });
    }
    if (
      action === 'update_invoice' &&
      await interviewer.confirm('Quieres emitir esta factura despues de actualizarla?', {
        defaultValue: false,
      })
    ) {
      interviewData.followUpActions.push('issue_invoice');
    }
  }

  if (action === 'accept_quote') {
    if (await interviewer.confirm('Quieres convertir el presupuesto a factura despues de aceptarlo?', { defaultValue: true })) {
      interviewData.followUpActions.push('convert_quote_to_invoice');
      interviewData.invoiceDocumentKey =
        interviewData.invoiceDocumentKey ??
        (await interviewer.ask('Document key local para la factura convertida:', {
          defaultValue: defaultDocumentKey(),
        }));
      if (await interviewer.confirm('Quieres emitir la factura convertida?', { defaultValue: true })) {
        interviewData.followUpActions.push('issue_invoice');
      }
      if (await interviewer.confirm('Quieres compartir la factura convertida?', { defaultValue: false })) {
        interviewData.followUpActions.push('share_invoice');
      }
      if (await interviewer.confirm('Quieres enviar la factura convertida por email?', { defaultValue: false })) {
        interviewData.followUpActions.push('send_invoice');
        interviewData.send = await collectInvoiceSendOptions({ interviewer });
      }
    }
  }

  if (action === 'convert_quote_to_invoice') {
    interviewData.invoiceDocumentKey =
      interviewData.invoiceDocumentKey ??
      (await interviewer.ask('Document key local para la factura convertida:', {
        defaultValue: defaultDocumentKey(),
      }));
    if (await interviewer.confirm('Quieres emitir la factura convertida?', { defaultValue: true })) {
      interviewData.followUpActions.push('issue_invoice');
    }
    if (await interviewer.confirm('Quieres compartir la factura convertida?', { defaultValue: false })) {
      interviewData.followUpActions.push('share_invoice');
    }
    if (await interviewer.confirm('Quieres enviar la factura convertida?', { defaultValue: false })) {
      interviewData.followUpActions.push('send_invoice');
      interviewData.send = await collectInvoiceSendOptions({ interviewer });
    }
  }

  if (action === 'issue_invoice') {
    if (await interviewer.confirm('Quieres compartir la factura justo despues de emitirla?', { defaultValue: false })) {
      interviewData.followUpActions.push('share_invoice');
    }
    if (await interviewer.confirm('Quieres enviar la factura justo despues de emitirla?', { defaultValue: false })) {
      interviewData.followUpActions.push('send_invoice');
      interviewData.send = await collectInvoiceSendOptions({ interviewer });
    }
  }

  if (action === 'send_invoice') {
    interviewData.send = await collectInvoiceSendOptions({ interviewer });
  }

  if (action === 'send_quote') {
    const email =
      targetDocument?.contact_snapshot?.email ??
      crmSnapshot.pointOfContact?.primaryEmail ??
      crmSnapshot.company?.email ??
      null;
    if (!email) {
      interviewData.warnings.push(
        'Quote send uses the stored AIKount contact email, but no obvious CRM email was available to confirm.',
      );
    }
  }
}

async function enrichContactOverrides({ interviewer, crmSnapshot, interviewData }) {
  const defaultEmail =
    crmSnapshot.pointOfContact?.primaryEmail ??
    crmSnapshot.company?.email ??
    '';
  interviewData.contact.vat =
    interviewData.contact.vat ??
    (await interviewer.ask('VAT/CIF/NIF del contacto (opcional):', {
      defaultValue: '',
    }));
  interviewData.contact.email =
    interviewData.contact.email ??
    (await interviewer.ask('Email del contacto (opcional):', {
      defaultValue: defaultEmail,
    }));
  interviewData.contact.legalName =
    interviewData.contact.legalName ??
    (await interviewer.ask('Razon social/legal name (opcional):', {
      defaultValue: crmSnapshot.company?.name ?? '',
    }));
}

async function chooseSeries({ interviewer, numbering, documentKind }) {
  if (!numbering.length) {
    return null;
  }
  const wantsSpecificSeries = await interviewer.confirm(
    `Quieres fijar una serie concreta para este ${documentKind}?`,
    { defaultValue: false },
  );
  if (!wantsSpecificSeries) {
    return null;
  }
  const choice = await interviewer.choose(
    'Series disponibles en AIKount:',
    numbering,
    (series) => `${series.code} · ${series.prefix ?? ''}${series.next_number ?? '?'} · ${series.doc_type}`,
  );
  return choice.id;
}

async function collectLines({ interviewer, crmSnapshot, taxes }) {
  const lines = [];
  if (crmSnapshot.amountValue !== null) {
    const useDefault = await interviewer.confirm(
      `Quieres usar una sola linea con el nombre del deal e importe ${crmSnapshot.amountValue} ${crmSnapshot.currencyCode ?? 'EUR'}?`,
      { defaultValue: true },
    );
    if (useDefault) {
      const tax = await chooseTax({ interviewer, taxes });
      return [
        compactLine({
          description: crmSnapshot.name,
          quantity: 1,
          unit_price: crmSnapshot.amountValue,
          tax_type_id: tax?.id ?? null,
          product_id: null,
        }),
      ];
    }
  }

  while (true) {
    const description = await interviewer.ask(
      `Descripcion de linea ${lines.length + 1} (vacío para terminar):`,
      { defaultValue: lines.length === 0 ? crmSnapshot.name : '' },
    );
    if (!description) {
      break;
    }
    const quantity = parseDecimal(
      await interviewer.ask('Cantidad:', { defaultValue: '1' }),
    );
    const unitPrice = parseDecimal(
      await interviewer.ask('Precio unitario:', { defaultValue: '' }),
    );
    const tax = await chooseTax({ interviewer, taxes });
    lines.push(
      compactLine({
        description,
        quantity,
        unit_price: unitPrice,
        tax_type_id: tax?.id ?? null,
        product_id: null,
      }),
    );
  }
  return lines;
}

async function chooseTax({ interviewer, taxes }) {
  if (!taxes.length) {
    return null;
  }
  const options = [{ id: null, code: 'NONE', name: 'Sin impuesto', rate: '0' }, ...taxes];
  return interviewer.choose(
    'Selecciona impuesto:',
    options,
    (item) => `${item.code} · ${item.name} · ${item.rate}%`,
  );
}

async function collectInvoiceSendOptions({ interviewer }) {
  const direct = await interviewer.confirm(
    'Quieres usar el envio simple de AIKount con el email guardado del contacto?',
    { defaultValue: true },
  );
  if (direct) {
    return { deliveryMethod: 'direct', cc: [], bcc: [] };
  }

  return {
    deliveryMethod: 'contact_email',
    toEmail: await interviewer.ask('Email destino (opcional):', { defaultValue: '' }),
    cc: parseEmailList(
      await interviewer.ask('CC separadas por comas (opcional):', {
        defaultValue: '',
      }),
    ),
    bcc: parseEmailList(
      await interviewer.ask('BCC separadas por comas (opcional):', {
        defaultValue: '',
      }),
    ),
    subject: await interviewer.ask('Asunto (opcional):', { defaultValue: '' }),
    message: await interviewer.ask('Mensaje (opcional):', { defaultValue: '' }),
  };
}

async function askKeepOrReplace({
  interviewer,
  label,
  currentValue,
  currentChoice,
}) {
  if (currentChoice !== null && currentChoice !== undefined && currentChoice !== '') {
    return currentChoice;
  }
  const value = await interviewer.ask(`${label} (Enter para dejar igual):`, {
    defaultValue: '',
  });
  return value || undefined;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.map((line) =>
    compactLine({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price ?? line.unitPrice,
      tax_type_id: line.tax_type_id ?? line.taxTypeId ?? null,
      product_id: line.product_id ?? line.productId ?? null,
    }),
  );
}

function normalizeSend(send) {
  return {
    deliveryMethod: send.deliveryMethod ?? 'direct',
    toEmail: send.toEmail ?? send.to_email ?? null,
    cc: Array.isArray(send.cc) ? send.cc : parseEmailList(send.cc),
    bcc: Array.isArray(send.bcc) ? send.bcc : parseEmailList(send.bcc),
    subject: send.subject ?? null,
    message: send.message ?? null,
  };
}

function normalizeFollowUpActions(followUpActions) {
  return Array.isArray(followUpActions) ? [...followUpActions] : [];
}

function normalizeContactOverrides(contact) {
  return {
    name: contact.name ?? null,
    legalName: contact.legalName ?? contact.legal_name ?? null,
    vat: contact.vat ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  };
}

function parseOptionalDecimal(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return parseDecimal(value);
}

function compactLine(line) {
  return Object.fromEntries(
    Object.entries(line).filter(([, value]) => value !== null && value !== undefined && value !== ''),
  );
}

function validateInterviewData({ request, interviewData, targetDocument }) {
  const action = request.action;
  if (
    (action === 'create_quote' || action === 'create_invoice') &&
    interviewData.lines.length === 0
  ) {
    interviewData.blockingIssues.push(
      issue('document_lines_required', `Action ${action} requires at least one line.`),
    );
  }
  if (
    (action === 'send_quote' || action === 'send_invoice') &&
    !targetDocument?.id
  ) {
    interviewData.blockingIssues.push(
      issue('target_document_required', `Action ${action} requires a target document.`),
    );
  }
}
