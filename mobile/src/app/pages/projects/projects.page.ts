import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { alertError, dateBR, formatError, listText, money, notifySuccess, parseMoney, splitCSV, statusClass } from '../../utils';

const stages = ['Proposta','Em produção','Revisão','Concluído','Cancelado'];
const blank:any={name:'',clientId:'',arrangementId:'',description:'',proposal:'',objective:'',references:'',musicalStyle:'',instruments:'',status:'Proposta',value:'',dueDate:'',paymentDueDate:'',paid:false};

@Component({selector:'app-projects-page',standalone:true,imports:[CommonModule,FormsModule,IconComponent,ModalComponent],templateUrl:'./projects.page.html'})
export class ProjectsPage {
  @Input() data:any=null;
  @Output() changed=new EventEmitter<void>();
  @Output() openProject=new EventEmitter<string>();

  q=''; editing:any=null; creating=false; form:any={...blank}; error:any=null; confirm:any=null; move:any=null;
  draggingId=''; dragOverStage=''; private suppressKanbanClickUntil=0;
  private pointerCandidate:any=null; private pointerDragging=false;

  readonly stages=stages;
  readonly styleOptions=['Orquestral','Cinemático','Pop','Rock','Eletrônica','Ambient','Jazz','MPB'];
  readonly instrumentOptions=['Piano','Violão','Guitarra','Baixo','Bateria','Synth','Strings','Violino','Cello','Metais','Vocal','Percussão'];
  money=money; dateBR=dateBR; statusClass=statusClass; listText=listText;

  constructor(private api:ApiService){}
  get clients(){return Object.fromEntries((this.data?.clients||[]).map((c:any)=>[c.id,c]));}
  get rows(){const q=this.q.toLowerCase();return (this.data?.projects||[]).filter((p:any)=>JSON.stringify(p).toLowerCase().includes(q));}
  count(stage:string){return (this.data?.projects||[]).filter((p:any)=>p.status===stage).length;}
  byStage(stage:string){return (this.data?.projects||[]).filter((p:any)=>p.status===stage);}
  errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
  open(p:any=null){this.editing=p;this.creating=!p;this.form=p?{...blank,...p,value:String(p.value??''),instruments:listText(p.instruments)}:{...blank};this.error=null;}
  closeEditor(){this.editing=null;this.creating=false;}
  addInstrument(value:string){const items=splitCSV(this.form.instruments);if(!items.some(x=>x.toLowerCase()===value.toLowerCase()))items.push(value);this.form.instruments=items.join(', ')}
  validate(){if(!String(this.form.name||'').trim())throw new Error('Nome: é obrigatório.');if(!this.form.clientId)throw new Error('Cliente: selecione um cliente.');const value=parseMoney(this.form.value);if(Number.isNaN(value)||value<0)throw new Error('Valor: informe um valor válido, como 5000 ou 5.000,00.');return value;}
  async save(){this.error=null;try{const wasEditing=!!this.editing;const value=this.validate();const payload={name:String(this.form.name||'').trim(),clientId:this.form.clientId,arrangementId:this.form.arrangementId||'',description:this.form.description||'',proposal:this.form.proposal||'',objective:this.form.objective||'',references:this.form.references||'',musicalStyle:this.form.musicalStyle||'',instruments:splitCSV(this.form.instruments),status:this.form.status||'Proposta',value,dueDate:this.form.dueDate||'',paymentDueDate:this.form.paymentDueDate||'',paid:!!this.form.paid};if(this.editing)await this.api.update('projects',this.editing.id,{...payload,version:this.editing.version});else await this.api.create('projects',payload);this.closeEditor();notifySuccess(wasEditing?'Projeto editado com sucesso':'Projeto cadastrado com sucesso',payload.name);this.changed.emit();}catch(err){this.error=err;alertError(err,'Não foi possível salvar o projeto')}}
  async remove(){if(!this.confirm)return;const name=this.confirm.name;try{await this.api.remove('projects',this.confirm.id,this.confirm.version);this.confirm=null;notifySuccess('Projeto excluído com sucesso',name||'O projeto foi removido.');this.changed.emit()}catch(err){this.error=err;this.confirm=null;alertError(err,'Não foi possível excluir o projeto')}}

  // Kanban por Pointer Events. Não usamos mais draggable/HTML5 DnD porque o
  // WebView2 pode iniciar dragstart mas perder o drop. Pointer Events funciona
  // de forma consistente dentro do app Tauri e continua independente do CSS.
  private dragGhost:HTMLElement|null=null;
  pointerDown(event:PointerEvent,id:string){
    if(event.button!==0 || event.pointerType==='touch')return;
    const source=event.currentTarget as HTMLElement|null;
    this.pointerCandidate={id,startX:event.clientX,startY:event.clientY,pointerId:event.pointerId,source};
    this.pointerDragging=false;this.dragOverStage='';
    try{source?.setPointerCapture(event.pointerId)}catch{}
  }
  @HostListener('document:pointermove',['$event'])
  pointerMove(event:PointerEvent){
    if(!this.pointerCandidate || this.pointerCandidate.pointerId!==event.pointerId)return;
    const dx=event.clientX-this.pointerCandidate.startX,dy=event.clientY-this.pointerCandidate.startY;
    if(!this.pointerDragging && Math.hypot(dx,dy)<5)return;
    if(!this.pointerDragging){
      this.pointerDragging=true;this.draggingId=this.pointerCandidate.id;
      this.suppressKanbanClickUntil=Date.now()+1000;
      document.body.classList.add('sonota-kanban-dragging');
      const source=this.pointerCandidate.source as HTMLElement|null;
      if(source){
        const rect=source.getBoundingClientRect();
        const ghost=source.cloneNode(true) as HTMLElement;
        ghost.classList.add('kanban-drag-ghost');ghost.classList.remove('dragging');
        ghost.style.width=`${rect.width}px`;document.body.appendChild(ghost);this.dragGhost=ghost;
      }
    }
    event.preventDefault();
    if(this.dragGhost){this.dragGhost.style.left=`${event.clientX+14}px`;this.dragGhost.style.top=`${event.clientY+14}px`;}
    const el=document.elementFromPoint(event.clientX,event.clientY) as HTMLElement|null;
    const column=el?.closest?.('[data-kanban-stage]') as HTMLElement|null;
    this.dragOverStage=column?.dataset?.['kanbanStage']||'';
  }
  @HostListener('document:pointerup',['$event'])
  pointerUp(event:PointerEvent){
    if(!this.pointerCandidate || this.pointerCandidate.pointerId!==event.pointerId)return;
    const id=this.pointerCandidate.id,wasDragging=this.pointerDragging,stage=this.dragOverStage;
    this.finishPointerDrag();
    if(wasDragging){this.suppressKanbanClickUntil=Date.now()+550;if(stage)void this.moveProject(id,stage);}
  }
  @HostListener('document:pointercancel',['$event'])
  pointerCancel(event:PointerEvent){if(this.pointerCandidate?.pointerId===event.pointerId)this.finishPointerDrag()}
  @HostListener('window:blur') windowBlur(){this.finishPointerDrag()}
  private finishPointerDrag(){
    const source=this.pointerCandidate?.source as HTMLElement|null;
    const pointerId=this.pointerCandidate?.pointerId;
    try{if(source&&pointerId!==undefined&&source.hasPointerCapture(pointerId))source.releasePointerCapture(pointerId)}catch{}
    this.dragGhost?.remove();this.dragGhost=null;this.pointerCandidate=null;this.pointerDragging=false;
    this.draggingId='';this.dragOverStage='';document.body.classList.remove('sonota-kanban-dragging');
  }
  openFromKanban(id:string){if(Date.now()<this.suppressKanbanClickUntil)return;this.openProject.emit(id)}

  private async moveProject(id:string,status:string){
    const p=(this.data?.projects||[]).find((x:any)=>x.id===id);
    if(!p||p.status===status)return;
    if(['Concluído','Cancelado'].includes(status)){this.move={project:p,status};return;}
    try{
      const updated=await this.api.update('projects',p.id,{status,version:p.version});
      Object.assign(p,updated||{status});notifySuccess('Etapa do projeto atualizada',`${p.name}: ${status}`);this.changed.emit();
    }catch(err){this.error=err;alertError(err,'Não foi possível alterar a etapa')}
  }

  async applyMove(){if(!this.move)return;try{const p=this.move.project;const targetStatus=this.move.status;const updated=await this.api.update('projects',p.id,{status:targetStatus,version:p.version});Object.assign(p,updated||{status:targetStatus});this.move=null;notifySuccess('Etapa do projeto atualizada',`${p.name}: ${targetStatus}`);this.changed.emit()}catch(err){this.error=err;this.move=null;alertError(err,'Não foi possível alterar a etapa')}}
}
