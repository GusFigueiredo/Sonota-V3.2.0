import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../icon/icon.component';
import { notifySuccess } from '../../utils';

@Component({selector:'app-assistant',standalone:true,imports:[CommonModule,FormsModule,IconComponent],templateUrl:'./assistant.component.html'})
export class AssistantComponent {
 @Input() context:any={}; @Output() changed=new EventEmitter<void>(); @Output() navigate=new EventEmitter<string>();
 open=false;text='';busy=false;pending:any=null;private requestGeneration=0;
 ai:any=null;aiChecking=false;aiRepairing=false;aiRepairMessage='';private aiTimer:any=null;
 readonly suggestions=['Quanto tenho para receber?','Cadastre um cliente chamado Lucas.','Crie um projeto para Marina.','Mostre projetos em produção.'];
 messages:any[]=[{role:'assistant',text:'Oi! Sou o agente local do Sonota. Posso consultar dados e preparar criações, edições e exclusões para sua confirmação. O cadastro de novos arranjos continua sendo feito pela Biblioteca.'}];
 constructor(private api:ApiService){}

 async toggle(){
  this.open=!this.open;
  if(this.open)await this.checkAi();
 }
 async checkAi(){
  if(this.aiChecking)return;
  this.aiChecking=true;
  try{this.ai=await this.api.aiStatus()}catch{}finally{this.aiChecking=false}
 }
 async repairAi(){
  if(this.aiRepairing)return;
  this.aiRepairing=true;this.aiRepairMessage='';
  try{
   const r:any=await this.api.aiRepair();
   this.aiRepairMessage=r?.message||'Preparação da IA iniciada.';
   if(this.aiTimer)clearInterval(this.aiTimer);
   this.aiTimer=setInterval(()=>void this.pollAiRepair(),3000);
   setTimeout(()=>void this.pollAiRepair(),900);
  }catch(err:any){this.aiRepairing=false;this.aiRepairMessage=err?.message||'Não foi possível preparar a IA.'}
 }
 async pollAiRepair(){
  try{
   const state:any=await this.api.aiRepairStatus();
   this.ai=state?.ai||this.ai;
   this.aiRepairMessage=state?.install?.message||state?.lastMessage||this.aiRepairMessage;
   if(!state?.running){
    this.aiRepairing=false;
    if(this.aiTimer){clearInterval(this.aiTimer);this.aiTimer=null}
    await this.checkAi();
    if(this.ai?.available){this.aiRepairMessage='IA local pronta para usar.';notifySuccess('IA local pronta','O assistente Qwen está disponível.');}
   }
  }catch{this.aiRepairing=false;if(this.aiTimer){clearInterval(this.aiTimer);this.aiTimer=null}}
 }
 cancelRequest(){
  this.requestGeneration++;
  this.busy=false;
  this.pending=null;
  this.messages.push({role:'assistant',text:'Pedido anterior desconsiderado. Nenhum cadastro foi salvo pelo cancelamento.'});
 }
 discardProposal(){
  this.pending=null;
  this.messages.push({role:'assistant',text:'Proposta descartada. Nenhuma alteração foi aplicada.'});
 }
 async ask(q?:string){const value=String(q??this.text).trim();if(!value||this.busy)return;this.text='';this.messages.push({role:'user',text:value});this.busy=true;const generation=++this.requestGeneration;try{const r=await this.api.assistant(value,this.context);if(generation!==this.requestGeneration)return;this.messages.push({role:'assistant',text:r.message});this.pending=r.action||null;if(r.navigate){const target=r.navigate.replace('.html','').replace('index','home').replace('busca-ia','biblioteca').replace(/^busca$/,'biblioteca');this.navigate.emit(target);}if(r.notice)void this.checkAi()}catch(err:any){if(generation!==this.requestGeneration)return;this.messages.push({role:'assistant',text:err.message});void this.checkAi()}finally{if(generation===this.requestGeneration)this.busy=false}}
 async confirm(){if(!this.pending||this.busy)return;this.busy=true;try{const r=await this.api.confirmAction(this.pending.id);this.messages.push({role:'assistant',text:r.message||'Alteração salva.'});this.pending=null;notifySuccess('Alteração realizada com sucesso',r.message||'A ação do assistente foi aplicada.');this.changed.emit()}catch(err:any){this.messages.push({role:'assistant',text:err.message});if(err?.status===409)this.pending=null}finally{this.busy=false}}
}
