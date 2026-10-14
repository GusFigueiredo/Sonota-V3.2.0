import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { alertError, formatError, notifySuccess } from '../../utils';

@Component({selector:'app-profile-page',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./profile.page.html'})
export class ProfilePage implements OnChanges {
 @Input() profile:any=null; @Output() changed=new EventEmitter<void>(); @Output() logout=new EventEmitter<void>();
 form:any={};error:any=null;saved=false;emailPassword='';avatar:File|null=null;pwd={currentPassword:'',newPassword:''};
 constructor(public api:ApiService){}
 ngOnChanges(_:SimpleChanges){this.form=structuredClone(this.profile||{})}
 errorLines(){return formatError(this.error).split('\n').filter(Boolean)}
 avatarSelected(e:Event){this.avatar=(e.target as HTMLInputElement).files?.[0]||null}
 pref(k:string,v:boolean){this.form.notificationPreferences={...(this.form.notificationPreferences||{}),[k]:v}}
 async save(){this.saved=false;this.error=null;try{await this.api.updateProfile({name:this.form.name,email:this.form.email,studio:this.form.studio||'',role:this.form.role||'',phone:this.form.phone||'',notificationPreferences:this.form.notificationPreferences,version:this.form.version,...(this.form.email!==this.profile.email?{currentPassword:this.emailPassword}:{})});this.saved=true;this.emailPassword='';notifySuccess('Perfil atualizado com sucesso');this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível atualizar o perfil')}}
 async changePassword(){this.error=null;try{await this.api.changePassword(this.pwd);this.pwd={currentPassword:'',newPassword:''};notifySuccess('Senha alterada com sucesso');this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível alterar a senha')}}
 async uploadAvatar(){if(!this.avatar)return;this.error=null;try{await this.api.uploadAvatar(this.avatar);this.avatar=null;notifySuccess('Foto de perfil atualizada');this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível atualizar a foto')}}
 async removeAvatar(){this.error=null;try{await this.api.removeAvatar();notifySuccess('Foto de perfil removida');this.changed.emit()}catch(err){this.error=err;alertError(err,'Não foi possível remover a foto')}}
}
