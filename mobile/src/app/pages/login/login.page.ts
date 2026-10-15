import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { formatError } from '../../utils';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html'
})
export class LoginPage {
  @Output() authenticated = new EventEmitter<void>();
  mode: 'login'|'register' = 'login';
  busy = false;
  resetNotice = '';
  error: any = null;
  form = {name:'', email:'', password:'', studio:'M&G Criação', role:'Produtor Musical'};
  constructor(private api: ApiService) {}
  errorLines() { return formatError(this.error).split('\n').filter(Boolean); }
  switchMode() { this.mode = this.mode === 'login' ? 'register' : 'login'; this.error = null; }
  async resetPassword() {
    if (this.busy) return;
    this.busy = true; this.error = null; this.resetNotice = '';
    try { await this.api.resetPassword(this.form.email); this.resetNotice = 'Se este e-mail possui uma conta Firebase, você receberá um link para redefinir a senha.'; }
    catch (error) { this.error = error; }
    finally { this.busy = false; }
  }
  async submit() {
    if (this.busy) return;
    this.busy = true; this.error = null;
    try {
      if (this.mode === 'register' && (this.form.password.length < 10 || !/\d/.test(this.form.password))) {
        const e: any = new Error('A senha deve ter pelo menos 10 caracteres e conter pelo menos 1 número.'); throw e;
      }
      const payload = this.mode === 'login' ? {email:this.form.email,password:this.form.password} : this.form;
      if (this.mode === 'login') await this.api.login(payload); else await this.api.register(payload);
      this.authenticated.emit();
    } catch (err: any) { if (err.code === 'PROFILE_REQUIRED') this.mode = 'register'; this.error = err; }
    finally { this.busy = false; }
  }
}
