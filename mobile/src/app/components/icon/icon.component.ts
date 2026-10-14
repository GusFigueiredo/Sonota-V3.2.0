import { Component, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const paths: Record<string,string> = {
  home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  clients:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  projects:'<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 11h8M8 15h5"/>',
  lab:'<path d="M9 3h6M10 3v6l-5.5 9.2A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.5-2.8L14 9V3"/><path d="M7.5 16h9"/>',
  library:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="M18 4v4M16 6h4"/>',
  finance:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/>',
  download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  music:'<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  stems:'<path d="M5 4v16M10 7v10M15 3v18M20 8v8"/>',
  midi:'<path d="M4 5h16v14H4z"/><path d="M7 5v7M10 5v7M14 5v7M17 5v7M8.5 12v7M15.5 12v7"/>',
  score:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M15 7v6"/><circle cx="13.5" cy="13" r="1.5"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 10v7M14 10v7"/>',
  details:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  moneyCheck:'<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 9h8M6 12h4"/><circle cx="17.5" cy="16.5" r="3.5"/><path d="m16 16.5 1 1 2-2"/>',
  moneyPending:'<path d="M3 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h16M7 14h4"/><circle cx="18" cy="6" r="3"/><path d="M18 4.8v1.4l1 .7"/>',
  forecast:'<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/><path d="m4 12 6-4 6 2 6-5"/>',
  attachment:'<path d="m9 12 5.5-5.5a3 3 0 0 1 4.2 4.2L11 18.4a5 5 0 0 1-7.1-7.1l8-8"/><path d="m7 14 7-7"/>',
  robot:'<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 3h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 15h6M3 11v4M21 11v4"/>'
};

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg class="ui-icon" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="path"></svg>`
})
export class IconComponent {
  constructor(private sanitizer: DomSanitizer) {}
  @Input() name = 'music';
  @Input() size = 20;
  @Input() strokeWidth = 1.8;
  get path(): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(paths[this.name] || paths['music']); }
}
