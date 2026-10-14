import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { alertError, formatError, money, notifySuccess, statusClass } from '../../utils';

const blank = {name:'',type:'Pessoa',company:'',email:'',phone:'',whatsapp:'',document:'',city:'',notes:'',status:'Ativo'};
@Component({selector:'app-clients-page',standalone:true,imports:[CommonModule,FormsModule,IconComponent,ModalComponent],templateUrl:'./clients.page.html'})
export class ClientsPage {
  @Input() data: any=null;
  @Output() changed = new EventEmitter<void>();
  q=''; editing:any=null; creating=false; detail:any=null; error:any=null; confirm:any=null;
  form:any={...blank}; money=money; statusClass=statusClass;
  constructor(private api:ApiService){}
  get rows(){const q=this.q.toLowerCase();return (this.data?.clients||[]).filter((c:any)=>JSON.stringify(c).toLowerCase().includes(q));}
  errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
  open(client:any=null){this.editing=client;this.creating=!client;this.form=client?{...blank,...client}:{...blank};this.error=null;}
  closeEditor(){this.editing=null;this.creating=false;}
  validate(){if(!String(this.form.name||'').trim())throw new Error('Nome: é obrigatório.');if(this.form.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email))throw new Error('E-mail: informe um e-mail válido.');}
  async save(){this.error=null;try{this.validate();const wasEditing=!!this.editing;const payload={...blank,...this.form,name:String(this.form.name||'').trim()};delete payload.id;delete payload.version;delete payload.createdAt;delete payload.updatedAt;if(this.editing)await this.api.update('clients',this.editing.id,{...payload,version:this.editing.version});else await this.api.create('clients',payload);this.closeEditor();notifySuccess(wasEditing?'Cliente editado com sucesso':'Cliente cadastrado com sucesso',payload.name);this.changed.emit();}catch(err){this.error=err;alertError(err,'Não foi possível salvar o cliente')}}
  async remove(){if(!this.confirm)return;const name=this.confirm.name;try{await this.api.remove('clients',this.confirm.id,this.confirm.version);this.confirm=null;notifySuccess('Cliente excluído com sucesso',name||'O cadastro foi removido.');this.changed.emit()}catch(err){this.error=err;this.confirm=null;alertError(err,'Não foi possível excluir o cliente')}}
  async showDetail(c:any){try{this.error=null;this.detail=await this.api.clientOverview(c.id)}catch(err){this.error=err}}
}
