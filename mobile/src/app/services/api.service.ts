import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '';
  private csrf = sessionStorage.getItem('sonota_csrf') || '';

  private async request(path: string, options: Omit<RequestInit, 'body'> & { body?: any } = {}) {
    const method = options.method || 'GET';
    const headers = new Headers(options.headers || {});
    const body = options.body;
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD'].includes(method) && this.csrf) headers.set('X-CSRF-Token', this.csrf);
    const response = await fetch(`${this.base}/api${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
      body: body === undefined || isForm ? body : JSON.stringify(body)
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error: any = new Error(data?.error?.message || 'Não foi possível concluir a operação.');
      error.status = response.status;
      error.code = data?.error?.code;
      error.details = data?.error?.details;
      throw error;
    }
    if (data?.csrf) {
      this.csrf = data.csrf;
      sessionStorage.setItem('sonota_csrf', this.csrf);
    }
    return data;
  }

  private multipart(metadata: any, file?: File | null) {
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    if (file) form.append('file', file);
    return form;
  }

  me() { return this.request('/auth/me'); }
  login(data: any) { return this.request('/auth/login', { method: 'POST', body: data }); }
  register(data: any) { return this.request('/auth/register', { method: 'POST', body: data }); }
  logout() { return this.request('/auth/logout', { method: 'POST' }); }
  bootstrap() { return this.request('/bootstrap'); }
  dashboard() { return this.request('/dashboard'); }
  create(type: string, data: any) { return this.request(`/${type}`, { method: 'POST', body: data }); }
  update(type: string, id: string, data: any) { return this.request(`/${type}/${id}`, { method: 'PATCH', body: data }); }
  remove(type: string, id: string, version: number) { return this.request(`/${type}/${id}`, { method: 'DELETE', headers: { 'If-Match': String(version) } }); }
  uploadArrangement(data: any, file: File | null) { return this.request('/arrangements', { method: 'POST', body: this.multipart(data, file) }); }
  updateArrangement(id: string, data: any, file?: File | null) { return this.request(`/arrangements/${id}`, { method: 'PATCH', body: this.multipart(data, file) }); }
  workspace(id: string) { return this.request(`/projects/${id}/workspace`); }
  clientOverview(id: string) { return this.request(`/clients/${id}/overview`); }
  addProjectVersion(projectId: string, data: any, file: File | null) { return this.request(`/projects/${projectId}/versions`, { method: 'POST', body: this.multipart(data, file) }); }
  updateProjectVersion(projectId: string, versionId: string, data: any) { return this.request(`/projects/${projectId}/versions/${versionId}`, { method: 'PATCH', body: data }); }
  markVersionSent(projectId: string, versionId: string) { return this.request(`/projects/${projectId}/versions/${versionId}/sent`, { method: 'POST' }); }
  removeVersion(projectId: string, versionId: string) { return this.request(`/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' }); }
  whatsapp(projectId: string, data: any) { return this.request(`/projects/${projectId}/whatsapp`, { method: 'POST', body: data }); }
  finance(projectId: string, data: any, file?: File | null) { return this.request(`/projects/${projectId}/finance`, { method: 'PATCH', body: this.multipart(data, file) }); }
  addDocument(data: any, file: File | null) { return this.request('/documents', { method: 'POST', body: this.multipart(data, file) }); }
  removeDocument(id: string) { return this.request(`/documents/${id}`, { method: 'DELETE' }); }
  search(query: string, limit = 20) { return this.request('/search', { method: 'POST', body: { query, limit } }); }
  assistant(message: string, context: any = {}) { return this.request('/assistant/message', { method: 'POST', body: { message, context } }); }
  confirmAction(id: string) { return this.request(`/assistant/actions/${id}/confirm`, { method: 'POST' }); }
  aiStatus() { return this.request('/ai/status'); }
  aiRepair() { return this.request('/desktop/ai/repair', { method: 'POST' }); }
  aiRepairStatus() { return this.request('/desktop/ai/status'); }
  capabilities() { return this.request('/capabilities'); }
  audioRepair() { return this.request('/desktop/audio/repair', { method: 'POST' }); }
  audioRepairStatus() { return this.request('/desktop/audio/status'); }
  startJob(arrangementId: string, type: string) { return this.request('/jobs', { method: 'POST', body: { arrangementId, type } }); }
  cancelJob(id: string) { return this.request(`/jobs/${id}/cancel`, { method: 'POST' }); }
  removeJob(id: string) { return this.request(`/jobs/${id}`, { method: 'DELETE' }); }
  updateProfile(data: any) { return this.request('/profile', { method: 'PATCH', body: data }); }
  uploadAvatar(file: File) { return this.request('/profile/avatar', { method: 'POST', body: this.multipart({}, file) }); }
  removeAvatar() { return this.request('/profile/avatar', { method: 'DELETE' }); }
  changePassword(data: any) { return this.request('/auth/password', { method: 'POST', body: data }); }
  revealFile(id: string) { return this.request(`/files/${id}/reveal`, { method: 'POST' }); }
  openFile(id: string) { return this.request(`/files/${id}/open`, { method: 'POST' }); }
  downloadFileLocal(id: string) { return this.request(`/files/${id}/download-local`, { method: 'POST' }); }
  fileUrl(id: string, download = false) { return `${this.base}/api/files/${id}${download ? '?download=1' : ''}`; }
  fileViewUrl(id: string) { return `${this.base}/api/files/${id}?inline=1`; }
  exportUrl() { return `${this.base}/api/export`; }
}
