import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { alertError, dateBR, formatError, money, notifySuccess, statusClass } from '../../utils';

@Component({selector:'app-finance-page',standalone:true,imports:[CommonModule,FormsModule,IconComponent,ModalComponent],templateUrl:'./finance.page.html'})
export class FinancePage {
 @Input() data:any=null; @Output() changed=new EventEmitter<void>(); editing:any=null;paid=false;due='';file:File|null=null;description='';mode='add';error:any=null;
 money=money;dateBR=dateBR;statusClass=statusClass;
 constructor(public api:ApiService){}
 get clients(){return Object.fromEntries((this.data?.clients||[]).map((c:any)=>[c.id,c]))}
 get docs(){return this.data?.docs||[]}
 get projects(){return (this.data?.projects||[]).filter((p:any)=>p.status!=='Cancelado'||p.paid)}
 errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
 financeStatus(p:any){if(p.paid)return'Recebido';if(p.paymentDueDate&&p.paymentDueDate<new Date().toISOString().slice(0,10))return'Atrasado';if(p.status==='Concluído')return'A receber';return'Previsto'}
 open(p:any){this.editing=p;this.paid=p.paid;this.due=p.paymentDueDate||'';this.file=null;this.description='';this.mode='add';this.error=null}
 fileSelected(e:Event){this.file=(e.target as HTMLInputElement).files?.[0]||null}
 async save(){const name=this.editing?.name||'Projeto';try{await this.api.finance(this.editing.id,{paid:this.paid,paymentDueDate:this.due,version:this.editing.version,mode:this.mode,description:this.description},this.file);this.editing=null;notifySuccess('Financeiro atualizado com sucesso',name);this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível atualizar o financeiro')}}
 async viewDoc(d:any){try{await this.api.openFile(d.fileId);notifySuccess('Arquivo aberto',d.fileName||'Documento financeiro');}catch(err){this.error=err;alertError(err,'Não foi possível abrir a nota fiscal')}}
 async downloadDoc(d:any){try{const result:any=await this.api.downloadFileLocal(d.fileId);notifySuccess('Download concluído',`Arquivo salvo em: ${result?.path||result?.name||'Downloads'}`);}catch(err){this.error=err;alertError(err,'Não foi possível baixar a nota fiscal')}}
 async removeDoc(id:string){try{await this.api.removeDocument(id);notifySuccess('Documento excluído com sucesso');this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível excluir o documento')}}
 docsFor(projectId:string){return this.docs.filter((d:any)=>d.projectId===projectId).length}
 projectName(id:string){return this.data?.projects?.find((x:any)=>x.id===id)?.name||'Projeto'}
}
