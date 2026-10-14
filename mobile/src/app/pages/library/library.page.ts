import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { alertError, formatError, listText, notifySuccess, splitCSV } from '../../utils';

const blank:any={title:'',bpm:'',key:'',genre:'',instruments:'',tags:'',notes:''};
@Component({selector:'app-library-page',standalone:true,imports:[CommonModule,FormsModule,IconComponent,ModalComponent],templateUrl:'./library.page.html'})
export class LibraryPage {
  @ViewChild('arrangementFileInput') arrangementFileInput?:ElementRef<HTMLInputElement>;
  @Input() data:any=null;
  @Output() changed=new EventEmitter<void>();

  smartQuery=''; smartResult:any=null; searching=false; filtersOpen=false;
  filters:any={min:'',max:'',key:'',genre:'',instrument:'',tag:''};
  editorOpen=false; editing:any=null; form:any={...blank}; file:File|null=null; confirmDelete:any=null; error:any=null; saving=false;

  readonly keyOptions=['C','Cm','C#','C#m','Db','D','Dm','D#','D#m','Eb','E','Em','F','Fm','F#','F#m','Gb','G','Gm','G#','G#m','Ab','A','Am','A#','A#m','Bb','B','Bm'];
  readonly genreOptions=['Trilha sonora','Orquestral','Pop','Rock','Eletrônica','Jazz','MPB','Ambient','Cinemático','Hip hop'];
  readonly instrumentOptions=['Piano','Violão','Guitarra','Baixo','Bateria','Synth','Strings','Violino','Cello','Metais','Vocal','Percussão'];
  readonly tagOptions=['emocional','épico','tecnologia','tensão','alegre','dramático','corporativo','futurista'];

  constructor(public api:ApiService){}

  get arrangements(){return this.data?.arrangements||[]}
  get genres(){return [...new Set(this.arrangements.map((a:any)=>a.genre).filter(Boolean))].sort() as string[]}
  get keys(){return [...new Set(this.arrangements.map((a:any)=>a.key).filter(Boolean))].sort() as string[]}
  get instruments(){return [...new Set(this.arrangements.flatMap((a:any)=>a.instruments||[]).filter(Boolean))].sort() as string[]}
  get smartRows(){return this.smartResult?(this.smartResult.results||[]).map((r:any)=>r.arrangement):this.arrangements}
  get rows(){
    const f=this.filters;
    return this.smartRows.filter((a:any)=>
      (!f.min||Number(a.bpm)>=Number(f.min))&&
      (!f.max||Number(a.bpm)<=Number(f.max))&&
      (!f.key||a.key===f.key)&&
      (!f.genre||a.genre===f.genre)&&
      (!f.instrument||(a.instruments||[]).some((x:string)=>x.toLowerCase().includes(f.instrument.toLowerCase())))&&
      (!f.tag||(a.tags||[]).some((x:string)=>x.toLowerCase().includes(f.tag.toLowerCase())))
    );
  }

  errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
  clearFilters(){this.filters={min:'',max:'',key:'',genre:'',instrument:'',tag:''}}
  clearSmartSearch(){this.smartQuery='';this.smartResult=null;this.error=null;}
  scoreFor(a:any){return this.smartResult?.results?.find((r:any)=>r.arrangement?.id===a?.id)?.relevance??null}
  scoreLabelFor(a:any){const row=this.smartResult?.results?.find((r:any)=>r.arrangement?.id===a?.id);return row?.matchLabel||`${row?.relevance??0}% compatível`}

  async runSmartSearch(){
    const query=this.smartQuery.trim();
    if(!query||this.searching)return;
    this.searching=true;this.error=null;
    try{this.smartResult=await this.api.search(query,50)}
    catch(err){this.error=err;alertError(err,'Não foi possível concluir a busca inteligente')}
    finally{this.searching=false}
  }

  openEditor(a:any=null){this.editing=a;this.editorOpen=true;this.error=null;this.file=null;this.form=a?{title:a.title,bpm:String(a.bpm??''),key:a.key||'',genre:a.genre||'',instruments:listText(a.instruments),tags:listText(a.tags),notes:a.notes||''}:{...blank};setTimeout(()=>{if(this.arrangementFileInput?.nativeElement)this.arrangementFileInput.nativeElement.value='';});}
  addOption(field:'instruments'|'tags',value:string){const items=splitCSV(this.form[field]);if(!items.some(x=>x.toLowerCase()===value.toLowerCase()))items.push(value);this.form[field]=items.join(', ')}
  fileSelected(e:Event){this.file=(e.target as HTMLInputElement).files?.[0]||null}
  closeEditor(){this.editorOpen=false;this.editing=null;this.form={...blank};this.file=null;this.error=null;if(this.arrangementFileInput?.nativeElement)this.arrangementFileInput.nativeElement.value='';}
  async saveArrangement(){this.error=null;this.saving=true;try{const wasEditing=!!this.editing;const bpm=Number(this.form.bpm);if(!this.form.title?.trim())throw new Error('Nome do arranjo: é obrigatório.');if(!Number.isFinite(bpm)||bpm<20||bpm>300)throw new Error('BPM: deve estar entre 20 e 300.');if(!this.editing&&!this.file)throw new Error('Arquivo: selecione um arquivo MP3, WAV, OGG ou FLAC.');const payload={title:this.form.title.trim(),bpm,key:this.form.key||'',genre:this.form.genre||'',instruments:splitCSV(this.form.instruments),tags:splitCSV(this.form.tags),notes:this.form.notes||''};if(this.editing)await this.api.updateArrangement(this.editing.id,{...payload,version:this.editing.version},this.file);else await this.api.uploadArrangement(payload,this.file);this.closeEditor();this.smartResult=null;notifySuccess(wasEditing?'Arranjo editado com sucesso':'Arranjo cadastrado com sucesso',payload.title);this.changed.emit();}catch(err){this.error=err;alertError(err,'Não foi possível salvar o arranjo')}finally{this.saving=false}}
  async removeArrangement(){if(!this.confirmDelete)return;const title=this.confirmDelete.title;try{await this.api.remove('arrangements',this.confirmDelete.id,this.confirmDelete.version);this.confirmDelete=null;this.smartResult=null;notifySuccess('Arranjo excluído com sucesso',title||'O arranjo foi removido.');this.changed.emit()}catch(err){this.error=err;this.confirmDelete=null;alertError(err,'Não foi possível excluir o arranjo')}}
  async showLocation(a:any){try{if(!a?.fileId)throw new Error('Este arranjo não possui um arquivo associado.');await this.api.revealFile(a.fileId);notifySuccess('Localização aberta',a.title||'Arquivo localizado no Explorer.')}catch(err){this.error=err;alertError(err,'Não foi possível abrir a localização do arquivo')}}
}
