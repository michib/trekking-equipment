import { debounceTime } from 'rxjs/operators/debounceTime';
import { AddEquipmentCollectionAction } from './store/actions/equipment-collection.actions';
import { SetEquipmentSetAction } from './store/actions/equipment-set.actions';
import { EquipmentSetState, selectEquipmentSet } from './store/equipment-set.reducer';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs/Observable';
import { EquipmentSet } from '../../shared/models/equipment-set.model';
import { ActivatedRoute, Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { environment } from '../../environments/environment';

@Component({
  selector: 'equip-equipment-set',
  templateUrl: './equipment-set.component.html',
  styleUrls: ['./equipment-set.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipmentSetComponent implements OnInit {
  equipmentSet$: Observable<EquipmentSetState>;
  nameForm: FormControl;

  editmode: boolean = true;

  constructor(private activatedRoute: ActivatedRoute,
              private store: Store<{ equipmentSet: EquipmentSetState }>,
              private router: Router) {
  }

  ngOnInit() {
    this.equipmentSet$ = this.store.select(selectEquipmentSet);

    this.activatedRoute.data.subscribe((data: { equipmentSet: EquipmentSet }) =>
      this.store.dispatch(new SetEquipmentSetAction(data.equipmentSet))
    );

    if (!environment.production) {
      for (let i = 1; i < 10; i++) {
        const id = Date.now() + `${i}`;
        this.store.dispatch(
          new AddEquipmentCollectionAction({
            id: id,
            name: `Collection ${i}`,
            entries: []
          })
        );
      }

      // this.store
      //   .select(selectEquipmentSet)
      //   .pipe(debounceTime(5000))
      //   .subscribe(state =>
      //     localStorage.setItem('state', JSON.stringify(state))
      //   );
    }
  }

  addCollection(): void {
    const id = Date.now() + '';
    this.store.dispatch(
      new AddEquipmentCollectionAction({
        id: id,
        name: 'New Collection',
        entries: []
      })
    );
    this.router.navigate(['/equipment-set', 'new', 'edit-collection', id]);
  }
}
