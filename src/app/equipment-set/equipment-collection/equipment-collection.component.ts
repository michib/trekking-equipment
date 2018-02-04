import { MatDialog } from '@angular/material';
import { EquipmentEntry } from '../../shared/models/equipment-entry.model';
import { EquipmentLimitDefinition } from '../../shared/models/equipment-limit-definition.model';
import { EditCollectionLimitsComponent } from '../edit-collection-limits/edit-collection-limits.component';
import { EquipmentEntryState } from '../store/reducer/equipment-entry.reducer';
import { EquipmentCollection } from '../../shared/models/equipment-collection.model';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { Store } from '@ngrx/store';
import {
  DeleteEquipmentCollectionAction, MoveEquipmentCollectionAction,
  UpdateEquipmentCollectionAction
} from '../store/actions/equipment-collection.actions';
import { FormControl } from '@angular/forms';
import { debounceTime } from 'rxjs/operators/debounceTime';
import {
  EquipmentSetFeatureState,
  EquipmentSetState,
  selectEquipmentEntries, selectEquipmentSetSettings,
  selectEquipmentVariants,
  selectSelectedVariantIds
} from '../store/equipment-set.reducer';
import { Observable } from 'rxjs/Observable';
import { AddEquipmentEntryAction } from '../store/actions/equipment-entry.actions';
import { Subject } from 'rxjs/Subject';
import { EquipmentVariant } from '../../shared/models/equipment-variant.model';
import { combineLatest, distinctUntilChanged, filter, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { MoveEntryEquipmentVariantAction } from '../store/actions/equipment-variant.actions';
import { StoreSelectHelperService } from '../store/store-select-helper.service';
import { EquipmentTotals } from '../../shared/models/equipment-totals.model';
import { EquipmentLimits } from '../../shared/models/equipment-limits.model';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { MoveCollectionDialogComponent } from '../move-collection-dialog/move-collection-dialog.component';
import { isNullOrUndefined } from 'util';
import { of } from 'rxjs/observable/of';

@Component({
  selector: 'equip-equipment-collection',
  templateUrl: './equipment-collection.component.html',
  styleUrls: ['./equipment-collection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('move', [
      transition(':enter', [
        style({height: '0px'}),
        animate(25, style({height: '*'}))
      ]),
      transition(':leave', [
        style({height: '*'}),
        animate(25, style({height: '0px'}))
      ]),
    ])
  ]
})
export class EquipmentCollectionComponent implements OnInit, OnChanges {
  nameForm: FormControl;
  @Input() order: number;
  @Input() collection: EquipmentCollection;

  @Input() totals: EquipmentTotals;
  entries$: Observable<EquipmentEntryState>;
  setId$: Observable<string>;

  selectedVariant$: Observable<EquipmentVariant>;

  moveMode: { entry: EquipmentEntry, index: number } = null;
  resetEntryEditMode$: Subject<void> = new Subject<void>();
  limitDefinitions$: Observable<Array<EquipmentLimitDefinition>>;

  setLimits$: Observable<EquipmentLimits>;

  private collectionLimits$: ReplaySubject<EquipmentLimits> = new ReplaySubject<EquipmentLimits>(1);

  constructor(private store: Store<EquipmentSetFeatureState>,
              private storeSelect: StoreSelectHelperService,
              private matDialog: MatDialog) {
  }

  ngOnInit() {
    this.setId$ = of('new');

    const localLimits$ = this.collectionLimits$.pipe(distinctUntilChanged());

    this.setLimits$ = this.store.select(selectEquipmentSetSettings).pipe(
      map(settings => settings.limits),
      withLatestFrom(this.storeSelect.getLimitDefinitions()),
      combineLatest(localLimits$),
      map(([[globalLimits, limitDefinitions], collectionLimits]) => limitDefinitions.reduce((setLimits, limitDefinition) => {
        setLimits[limitDefinition.name] =
          (collectionLimits && collectionLimits[limitDefinition.name])
          || (globalLimits && globalLimits[limitDefinition.name]);
        return setLimits;
      }, {})),
      tap(limits => console.log(`limits for collection ${this.collection.name}`, limits))
    );

    this.nameForm = new FormControl();
    this.nameForm.valueChanges
      .pipe(debounceTime(800))
      .subscribe(name =>
        this.store.dispatch(
          new UpdateEquipmentCollectionAction({id: this.collection.id, changes: {name}})
        )
      );

    this.limitDefinitions$ = this.storeSelect.getLimitDefinitions();

    this.entries$ = this.store.select(selectEquipmentEntries);
    this.selectedVariant$ = this.store.select(selectSelectedVariantIds).pipe(
      map(selectedVariantIds => selectedVariantIds[this.collection.id]),
      switchMap((variantId: string) => this.store.select(selectEquipmentVariants).pipe(
        map(variants => variants.entities[variantId]))
      )
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['collection'] && (changes['collection'].firstChange ||
        (changes['collection'].previousValue.limits !== changes['collection'].currentValue.limits))) {
      this.collectionLimits$.next(changes['collection'].currentValue.limits);
    }
  }

  delete(): void {
    this.store.dispatch(new DeleteEquipmentCollectionAction(this.collection));
  }

  addEntry(input: HTMLInputElement): void {
    if (!input.value) {
      return;
    }

    this.store.dispatch(
      new AddEquipmentEntryAction({
        id: Date.now().toString(),
        name: input.value,
        collectionId: this.collection.id,
        items: []
      })
    );

    input.value = null;
  }

  move(entry: EquipmentEntry, index: number): void {
    this.moveMode = entry.id !== (this.moveMode && this.moveMode.entry.id) ? {entry, index} : null;
    this.resetEntryEditMode$.next();
  }

  dropTo(index: number): void {
    this.store.dispatch(new MoveEntryEquipmentVariantAction({
      collectionId: this.collection.id,
      entryId: this.moveMode.entry.id,
      moveTo: index
    }));
    this.moveMode = null;
  }

  get moveIndex(): number {
    return this.moveMode ? this.moveMode.index : 0;
  }

  variantEntryId(index: number, variantEntry: { entryId: string }): string {
    return variantEntry.entryId;
  }

  editLimits(): void {
    const dialogRef = this.matDialog.open(EditCollectionLimitsComponent, {data: this.collection.limits});
    dialogRef.afterClosed()
      .pipe(filter(value => !!value))
      .subscribe(value =>
        this.store.dispatch(new UpdateEquipmentCollectionAction({
          id: this.collection.id,
          // check that there are some set limits, else set undefined
          changes: {limits: Object.keys(value).some(k => !!value[k]) ? value : undefined}
        }))
      );
  }

  moveCollection() {
    const dialogRef = this.matDialog.open(MoveCollectionDialogComponent, {
      data: this.order
    });
    dialogRef.afterClosed().pipe(
     filter(result => !isNullOrUndefined(result))
    ).subscribe(result => this.store.dispatch(new MoveEquipmentCollectionAction({id: this.collection.id, moveTo: result})));
  }
}
