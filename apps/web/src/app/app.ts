import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHost } from './shared/ui/confirm';
import { Toasts } from './shared/ui/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts, ConfirmHost],
  template: '<router-outlet /><ui-toasts /><ui-confirm-host />',
})
export class App {}
