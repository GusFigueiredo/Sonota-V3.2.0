import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../../components/icon/icon.component';
import { alertError, formatError, notifyError, notifyInfo, notifySuccess } from '../../utils';

@Component({selector:'app-arrangement-lab-page',standalone:true,imports:[CommonModule,FormsModule,IconComponent],templateUrl:'./arrangement-lab.page.html'})
export class ArrangementLabPage implements OnChanges,OnDestroy {
  @Input() data:any=null;
  @Output() changed=new EventEmitter<void>();
  stemId=''; transcriptionId=''; transcriptionType='midi'; error:any=null; starting=''; repairing=false; repairMessage=''; repairTimer:any=null; repairNotified=false;

  constructor(public api:ApiService){}

  get arrangements(){return this.data?.arrangements||[]}
  get jobs(){return this.data?.transcriptions||[]}
  get audioCapabilities(){return this.data?.capabilities?.audio||{analysis:false,midi:false,partitura:false,stems:false,reason:'Recursos de áudio ainda não detectados.',details:{}}}
  get active(){return this.jobs.some((j:any)=>['queued','running'].includes(j.status))}
  get stemArrangement(){return this.arrangements.find((a:any)=>a.id===this.stemId)}
  get transcriptionArrangement(){return this.arrangements.find((a:any)=>a.id===this.transcriptionId)}
  get sortedJobs(){return [...this.jobs].sort((a:any,b:any)=>String(b.updatedAt||b.date).localeCompare(String(a.updatedAt||a.date)))}

  ngOnChanges(_:SimpleChanges){
    if(this.arrangements.length){
      if(!this.stemId||!this.arrangements.some((a:any)=>a.id===this.stemId))this.stemId=this.arrangements[0].id;
      if(!this.transcriptionId||!this.arrangements.some((a:any)=>a.id===this.transcriptionId))this.transcriptionId=this.arrangements[0].id;
    }
  }
  ngOnDestroy(){if(this.repairTimer)clearInterval(this.repairTimer)}
  errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
  statusLabel(status:string){return ({queued:'Na fila',running:'Processando',completed:'Concluído',failed:'Falhou',cancelled:'Cancelado'} as any)[status]||status}
  typeName(job:any){return job.type==='stems'?'Stems':job.type==='midi'?'MIDI':'Partitura'}
  jobIcon(job:any){return job.type==='stems'?'stems':job.type==='midi'?'midi':'score'}
  jobArrangement(job:any){return this.arrangements.find((a:any)=>a.id===job.arrangementId)}
  can(type:string){return !!this.audioCapabilities?.[type]}
  capabilityProblem(type:string){return this.audioCapabilities?.details?.[type]||this.audioCapabilities?.reason||'Recurso indisponível.'}

  async repairAudio(){
    if(this.repairing)return;
    this.error=null;this.repairMessage='';this.repairing=true;this.repairNotified=false;
    try{
      const result:any=await this.api.audioRepair();
      this.repairMessage=result?.message||'Reparo iniciado.';
      if(this.repairTimer)clearInterval(this.repairTimer);
      this.repairTimer=setInterval(()=>void this.checkRepair(),3000);
      setTimeout(()=>void this.checkRepair(),900);
    }catch(err){
      this.repairing=false;this.error=err;alertError(err,'Não foi possível iniciar o reparo de áudio');
    }
  }
  async checkRepair(){
    try{
      const state:any=await this.api.audioRepairStatus();
      if(state?.audio){
        this.data.capabilities=this.data.capabilities||{};
        this.data.capabilities.audio=state.audio;
      }
      this.repairMessage=state?.install?.message||state?.lastMessage||this.repairMessage;
      if(!state?.running){
        this.repairing=false;
        if(this.repairTimer){clearInterval(this.repairTimer);this.repairTimer=null;}
        if(!this.repairNotified){
          this.repairNotified=true;
          if(state?.install?.ok && this.can('stems')&&this.can('midi')&&this.can('partitura')){
            this.repairMessage='Dependências instaladas com sucesso. Recursos de áudio prontos para usar.';
            notifySuccess('Dependências instaladas com sucesso','Stems, MIDI e Partitura estão disponíveis.');
          }else if(state?.install?.ok===false){
            notifyError('Não foi possível concluir a configuração',state?.install?.message||'Consulte o diagnóstico do Laboratório.');
          }
        }
      }
    }catch(err){
      this.repairing=false;
      if(this.repairTimer){clearInterval(this.repairTimer);this.repairTimer=null;}
    }
  }

  async start(id:string,type:string){
    if(!id){
      const e=new Error('Selecione um arquivo da Biblioteca antes de iniciar.');
      this.error=e;alertError(e,'Não foi possível iniciar o processamento');return;
    }
    if(!this.can(type)){
      const e=new Error(this.capabilityProblem(type));
      this.error=e;alertError(e,type==='stems'?'Separação de stems indisponível':'Transcrição indisponível');return;
    }
    this.error=null;this.starting=type;
    try{
      await this.api.startJob(id,type);
      const arrangement=this.arrangements.find((a:any)=>a.id===id);
      const label=type==='stems'?'Separação de stems iniciada':type==='midi'?'Transcrição MIDI iniciada':'Geração de partitura iniciada';
      notifyInfo(label,arrangement?.title||'O processamento foi adicionado à fila.');
      this.changed.emit();
      // Uma segunda atualização curta faz a fila aparecer imediatamente mesmo
      // em computadores lentos, antes do polling assumir o acompanhamento.
      setTimeout(()=>this.changed.emit(),450);
    }catch(err){
      this.error=err;
      alertError(err,type==='stems'?'Não foi possível separar os stems':'Não foi possível iniciar a transcrição');
    }finally{this.starting=''}
  }

  formatDuration(seconds:any){const n=Math.max(0,Math.round(Number(seconds)||0));if(n<60)return `${n}s`;const m=Math.floor(n/60),s=n%60;return s?`${m} min ${s}s`:`${m} min`;}
  progressText(job:any){if(job.status==='queued')return `Estimativa: ~${this.formatDuration(job.estimatedSeconds)}`;if(job.status==='running')return job.remainingSeconds>0?`~${this.formatDuration(job.remainingSeconds)} restantes • ${job.progressPercent||0}%`:'Finalizando…';return '';}

  async cancel(job:any){
    try{await this.api.cancelJob(job.id);notifySuccess('Processamento cancelado',this.jobArrangement(job)?.title||this.typeName(job));this.changed.emit()}
    catch(err){this.error=err;alertError(err,'Não foi possível cancelar o processamento')}
  }
  async removeJob(job:any){
    try{await this.api.removeJob(job.id);notifySuccess('Histórico removido',this.jobArrangement(job)?.title||this.typeName(job));this.changed.emit()}
    catch(err){this.error=err;alertError(err,'Não foi possível remover este histórico')}
  }
}
