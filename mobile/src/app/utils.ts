export const money = (n: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
export const dateBR = (v: any) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '—';
export const splitCSV = (v: any) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
export const statusClass = (value: any) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
export const listText = (value: any) => Array.isArray(value) ? value.join(', ') : String(value || '');
const labels: Record<string,string> = {name:'Nome',title:'Nome do arranjo',type:'Tipo',company:'Empresa',email:'E-mail',phone:'Telefone',whatsapp:'WhatsApp',document:'CPF / CNPJ',city:'Cidade',notes:'Observações',clientId:'Cliente',arrangementId:'Arranjo',description:'Descrição',proposal:'Proposta / briefing',objective:'Objetivo',references:'Referências',musicalStyle:'Estilo musical',instruments:'Instrumentos',status:'Status',value:'Valor',dueDate:'Prazo',paymentDueDate:'Vencimento',paid:'Pagamento',bpm:'BPM',key:'Tonalidade',genre:'Gênero',tags:'Tags',file:'Arquivo',password:'Senha',currentPassword:'Senha atual'};
export function formatError(error: any) {
  if (!error) return '';
  const parts: string[] = [];
  if (error.message) parts.push(error.message);
  for (const detail of error.details || []) {
    const field = labels[detail.field] || detail.field || 'Campo';
    const line = `${field}: ${detail.message || 'Valor inválido.'}`;
    if (!parts.includes(line)) parts.push(line);
  }
  return parts.join('\n');
}
export type FeedbackKind = 'success' | 'error' | 'info' | 'warning';
export function notify(kind: FeedbackKind, title: string, message = '', duration?: number) {
  window.dispatchEvent(new CustomEvent('sonota-toast', { detail: { kind, title, message, duration } }));
}
export function notifySuccess(title: string, message = '') { notify('success', title, message); }
export function notifyInfo(title: string, message = '') { notify('info', title, message); }
export function notifyWarning(title: string, message = '') { notify('warning', title, message, 5000); }
export function notifyError(title: string, message = '') { notify('error', title, message, 6500); }
export function alertError(error: any, title = 'Não foi possível salvar') {
  notifyError(title, formatError(error) || 'Revise os campos informados e tente novamente.');
}
export function parseMoney(value: any) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}
