import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ModalComponent } from '../../components/modal/modal.component';
import { alertError, dateBR, formatError, money, notifySuccess, statusClass } from '../../utils';

@Component({selector:'app-project-workspace-page',standalone:true,imports:[CommonModule,FormsModule,ModalComponent],templateUrl:'./project-workspace.page.html'})
export class ProjectWorkspacePage implements OnChanges {
 @Input() projectId=''; @Output() back=new EventEmitter<void>(); @Output() changed=new EventEmitter<void>();
 w:any=null;error:any=null;addVersion=false;vform:any={label:'',notes:'',status:'Protótipo'};file:File|null=null;whatsapp:any=null;message='';editVersion:any=null;versionDelete:any=null;docOpen=false;docFile:File|null=null;docDesc='';
 money=money;dateBR=dateBR;statusClass=statusClass;
 constructor(public api:ApiService){}
 async ngOnChanges(changes:SimpleChanges){if(changes['projectId']&&this.projectId)await this.load()}
 async load(){try{this.w=await this.api.workspace(this.projectId)}catch(err){this.error=err}}
 errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
 async refresh(){await this.load();this.changed.emit()}
 fileSelected(e:Event,type:'version'|'doc'){const f=(e.target as HTMLInputElement).files?.[0]||null;if(type==='version')this.file=f;else this.docFile=f}
 async uploadVersion(){if(!this.file)return;try{const label=this.vform.label||this.file.name;await this.api.addProjectVersion(this.projectId,this.vform,this.file);this.addVersion=false;this.vform={label:'',notes:'',status:'Protótipo'};this.file=null;notifySuccess('Versão adicionada com sucesso',label);await this.refresh()}catch(err){this.error=err;alertError(err,'Não foi possível adicionar a versão')}}
 startEditVersion(v:any){this.editVersion={...v}}
 async saveVersion(){if(!this.editVersion)return;try{const label=this.editVersion.label;await this.api.updateProjectVersion(this.projectId,this.editVersion.id,{label:this.editVersion.label,notes:this.editVersion.notes,status:this.editVersion.status});this.editVersion=null;notifySuccess('Versão editada com sucesso',label);await this.refresh()}catch(err){this.error=err;alertError(err,'Não foi possível editar a versão')}}
 async deleteVersion(){try{const label=this.versionDelete?.label;await this.api.removeVersion(this.projectId,this.versionDelete.id);this.versionDelete=null;notifySuccess('Versão excluída com sucesso',label||'A versão foi removida.');await this.refresh()}catch(err){this.error=err;this.versionDelete=null;alertError(err,'Não foi possível excluir a versão')}}
 async prepareWhatsApp(v:any){try{const r=await this.api.whatsapp(this.projectId,{versionId:v?.id});this.whatsapp={...r,versionId:v?.id};this.message=r.message}catch(err){this.error=err}}
 async openWhatsApp(){try{const r=await this.api.whatsapp(this.projectId,{versionId:this.whatsapp?.versionId,message:this.message});window.open(r.url,'_blank','noopener,noreferrer')}catch(err){this.error=err}}
 async markSent(versionId:string){try{await this.api.markVersionSent(this.projectId,versionId);this.whatsapp=null;notifySuccess('Envio registrado com sucesso');await this.refresh()}catch(err){this.error=err;alertError(err,'Não foi possível registrar o envio')}}
 async shareVersion(v:any){try{const info=await this.api.whatsapp(this.projectId,{versionId:v.id});const response=await fetch(this.api.fileUrl(v.fileId),{credentials:'include'});if(!response.ok)throw new Error('Não foi possível carregar o arquivo para compartilhar.');const blob=await response.blob();const sharedFile=new File([blob],v.fileName,{type:blob.type||v.fileType||'audio/mpeg'});const shareData:any={title:this.w.project.name,text:info.message,files:[sharedFile]};if(navigator.share&&(!(navigator as any).canShare||(navigator as any).canShare(shareData))){await navigator.share(shareData);await this.markSent(v.id);return;}this.whatsapp={...info,versionId:v.id};this.message=info.message}catch(err:any){if(err?.name!=='AbortError')this.error=err}}
 async addDocument(){if(!this.docFile)return;try{const name=this.docFile.name;await this.api.addDocument({projectId:this.projectId,description:this.docDesc},this.docFile);this.docOpen=false;this.docFile=null;this.docDesc='';notifySuccess('Documento adicionado com sucesso',name);await this.refresh()}catch(err){this.error=err;alertError(err,'Não foi possível adicionar o documento')}}
 async viewDoc(d:any){try{await this.api.openFile(d.fileId);notifySuccess('Arquivo aberto',d.fileName||'Documento financeiro')}catch(err){this.error=err;alertError(err,'Não foi possível abrir a nota fiscal')}}
 async downloadDoc(d:any){try{const result:any=await this.api.downloadFileLocal(d.fileId);notifySuccess('Download concluído',`Arquivo salvo em: ${result?.path||result?.name||'Downloads'}`)}catch(err){this.error=err;alertError(err,'Não foi possível baixar a nota fiscal')}}
 async removeDoc(id:string){try{await this.api.removeDocument(id);notifySuccess('Documento excluído com sucesso');await this.refresh()}catch(err){this.error=err;alertError(err,'Não foi possível excluir o documento')}}
}
