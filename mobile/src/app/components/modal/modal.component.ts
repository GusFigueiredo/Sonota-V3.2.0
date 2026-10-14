import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open) {
      <div class="modal open" (mousedown)="backdrop($event)">
        <div class="modal-panel" [class.wide]="wide" role="dialog" aria-modal="true">
          <div class="modal-head"><strong>{{ title }}</strong><button class="icon-btn" type="button" (click)="close.emit()">×</button></div>
          <div class="modal-body"><ng-content></ng-content></div>
          @if (showFooter) { <div class="modal-footer"><ng-content select="[modal-footer]"></ng-content></div> }
        </div>
      </div>
    }
  `
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() wide = false;
  @Input() showFooter = false;
  @Output() close = new EventEmitter<void>();
  backdrop(event: MouseEvent) { if ((event.target as HTMLElement).classList.contains('modal')) this.close.emit(); }
}
