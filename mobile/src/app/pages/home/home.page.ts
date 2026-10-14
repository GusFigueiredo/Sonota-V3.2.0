import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../components/icon/icon.component';
import { dateBR, statusClass } from '../../utils';

@Component({
  selector:'app-home-page',
  standalone:true,
  imports:[CommonModule,IconComponent],
  templateUrl:'./home.page.html'
})
export class HomePage {
  @Input() data:any=null;
  @Input() profile:any=null;
  @Output() openProject=new EventEmitter<string>();
  @Output() navigate=new EventEmitter<string>();

  dateBR=dateBR;
  statusClass=statusClass;

  readonly tools=[
    {page:'biblioteca',icon:'library',title:'Biblioteca',text:'Encontre arranjos com a busca inteligente integrada.'},
    {page:'arranjos',icon:'lab',title:'Laboratório',text:'Gere stems, MIDI e partitura a partir do acervo.'},
    {page:'projetos',icon:'projects',title:'Projetos',text:'Acompanhe produção, revisões e entregas.'},
    {page:'financeiro',icon:'finance',title:'Financeiro',text:'Veja recebimentos, previsões e pendências.'}
  ];

  get firstName(){return this.profile?.name?.split(' ')[0]||'Jether';}
  get clients(){return Object.fromEntries((this.data?.clients||[]).map((c:any)=>[c.id,c]));}
  get arrangements(){return Object.fromEntries((this.data?.arrangements||[]).map((a:any)=>[a.id,a]));}
  get recentProjects(){
    return [...(this.data?.projects||[])]
      .sort((a:any,b:any)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))
      .slice(0,3);
  }
  clientName(project:any){return this.clients[project?.clientId]?.name||'Cliente não informado';}
  arrangementName(project:any){return this.arrangements[project?.arrangementId]?.title||'';}
  updatedLabel(project:any){
    const value=project?.updatedAt||project?.createdAt;
    if(!value)return 'Atualizado recentemente';
    const parsed=new Date(value);
    if(Number.isNaN(parsed.getTime()))return 'Atualizado recentemente';
    return `Atualizado em ${parsed.toLocaleDateString('pt-BR')}`;
  }
}
