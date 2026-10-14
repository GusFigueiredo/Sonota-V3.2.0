import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { dateBR, money, statusClass } from '../../utils';
import { IconComponent } from '../../components/icon/icon.component';

@Component({selector:'app-dashboard-page',standalone:true,imports:[CommonModule,IconComponent],templateUrl:'./dashboard.page.html'})
export class DashboardPage implements OnInit {
  @Input() profile: any=null;
  @Output() openProject = new EventEmitter<string>();
  data: any = null;
  max = 1;
  money = money; dateBR = dateBR; statusClass = statusClass;
  constructor(private api: ApiService) {}
  async ngOnInit(){ try { this.data = await this.api.dashboard(); this.max = Math.max(1,...(this.data.studioFlow||[]).map((x:any)=>x.created||0)); } catch {} }
  get firstName(){ return this.profile?.name?.split(' ')[0] || 'Jether'; }
  barHeight(x:any){ return `${Math.max(5,((x.created||0)/this.max)*100)}%`; }
  day(v:string){ return new Date(`${v}T12:00:00`).getDate(); }
  month(v:string){ return new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR',{month:'short'}).replace('.',''); }
}
