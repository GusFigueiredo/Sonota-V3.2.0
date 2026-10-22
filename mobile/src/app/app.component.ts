import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './services/api.service';
import { IconComponent } from './components/icon/icon.component';
import { AssistantComponent } from './components/assistant/assistant.component';
import { LoginPage } from './pages/login/login.page';
import { HomePage } from './pages/home/home.page';
import { DashboardPage } from './pages/dashboard/dashboard.page';
import { ClientsPage } from './pages/clients/clients.page';
import { ProjectsPage } from './pages/projects/projects.page';
import { ProjectWorkspacePage } from './pages/project-workspace/project-workspace.page';
import { ArrangementLabPage } from './pages/arrangement-lab/arrangement-lab.page';
import { LibraryPage } from './pages/library/library.page';
import { FinancePage } from './pages/finance/finance.page';
import { ProfilePage } from './pages/profile/profile.page';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { notifyError, notifySuccess } from './utils';

@Component({
 selector:'app-root',standalone:true,
 imports:[CommonModule,IconComponent,AssistantComponent,ToastHostComponent,LoginPage,HomePage,DashboardPage,ClientsPage,ProjectsPage,ProjectWorkspacePage,ArrangementLabPage,LibraryPage,FinancePage,ProfilePage],
 templateUrl:'./app.component.html'
})
export class AppComponent implements OnInit, OnDestroy {
 auth:'loading'|'guest'|'ready'='loading'; data:any=null; page='home'; projectId:string|null=null; fatal:any=null; menuOpen=window.innerWidth>820;
 readonly nav=[['home','Início','home'],['dashboard','Dashboard','dashboard'],['clientes','Clientes','clients'],['biblioteca','Biblioteca','library'],['projetos','Projetos','projects'],['arranjos','Laboratório de arranjos','lab'],['financeiro','Financeiro','finance']];
 private jobStates=new Map<string,string>();
 private jobStatesReady=false;
 private notifiedJobStates=new Set<string>();
 private jobPollTimer:any=null;
 private refreshingJobs=false;
 constructor(public api:ApiService){}
 async ngOnInit(){await this.reload()}
 ngOnDestroy(){if(this.jobPollTimer)clearInterval(this.jobPollTimer)}
 @HostListener('window:resize') onResize(){if(window.innerWidth<=820&&this.menuOpen&&document.activeElement?.tagName!=='BUTTON')this.menuOpen=false}
 async reload(){
  try{
   const me=await this.api.me();
   const boot=await this.api.bootstrap();
   this.notifyJobTransitions(boot);
   this.data={...boot,profile:me.user};this.auth='ready';this.fatal=null;
   this.syncJobPolling(boot);
  }catch(err:any){if(err.status===401){this.auth='guest';this.data=null}else{this.fatal=err;this.auth='guest'}}
 }
 private notifyJobTransitions(boot:any){
  const jobs=boot?.transcriptions||[];
  const arrangements=new Map((boot?.arrangements||[]).map((a:any)=>[a.id,a]));
  if(this.jobStatesReady){
   for(const job of jobs){
    const previous=this.jobStates.get(job.id);
    if(!previous||previous===job.status)continue;
    const notificationKey=`${job.id}:${job.status}`;
    if(this.notifiedJobStates.has(notificationKey))continue;
    const arrangement:any=arrangements.get(job.arrangementId);
    const name=arrangement?.title||'arranjo';
    if(job.status==='completed'){
     const title=job.type==='stems'?'Separação de stems concluída':job.type==='midi'?'Transcrição MIDI concluída':'Partitura concluída';
     notifySuccess(title,`“${name}” foi processado com sucesso.`);this.notifiedJobStates.add(notificationKey);
    }else if(job.status==='failed'){
     const title=job.type==='stems'?'Falha na separação de stems':job.type==='midi'?'Falha na transcrição MIDI':'Falha na geração da partitura';
     notifyError(title,job.error||`Não foi possível processar “${name}”.`);this.notifiedJobStates.add(notificationKey);
    }
   }
  }
  this.jobStates=new Map(jobs.map((j:any)=>[j.id,j.status]));
  this.jobStatesReady=true;
 }
 private syncJobPolling(boot:any){
  const active=(boot?.transcriptions||[]).some((j:any)=>['queued','running'].includes(j.status));
  if(active&&!this.jobPollTimer){this.jobPollTimer=setInterval(()=>void this.refreshJobs(),2200);}
  if(!active&&this.jobPollTimer){clearInterval(this.jobPollTimer);this.jobPollTimer=null;}
 }
 private async refreshJobs(){
  if(this.refreshingJobs||this.auth!=='ready')return;
  this.refreshingJobs=true;
  try{
   const boot=await this.api.bootstrap();
   this.notifyJobTransitions(boot);
   this.data={...boot,profile:this.data?.profile};
   this.syncJobPolling(boot);
  }catch{}finally{this.refreshingJobs=false;}
 }
 async logout(){try{await this.api.logout();this.auth='guest';this.data=null;this.projectId=null;this.syncJobPolling({transcriptions:[]})}catch(error:any){notifyError('Não foi possível sair',error.message)}}
 navigate(p:string){this.projectId=null;this.page=p;if(window.innerWidth<=820)this.menuOpen=false}
 openProject(id:string){this.projectId=id;this.page='projetos';if(window.innerWidth<=820)this.menuOpen=false}
 labelForPage(){return this.projectId?'Projeto':(this.nav.find(x=>x[0]===this.page)?.[1]||'Sonota')}
}
