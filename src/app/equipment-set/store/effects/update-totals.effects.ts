import {
  EquipmentSetState, selectEquipmentCollections, selectEquipmentItems, selectEquipmentLimits,
  selectEquipmentVariants
} from '../equipment-set.reducer';
import { Store } from '@ngrx/store';
import { Injectable } from '@angular/core';
import { Actions, Effect } from '@ngrx/effects';
import { Observable } from 'rxjs/Observable';
import {
  EquipmentVariantActionTypes,
  MoveEntryEquipmentVariantAction,
  RecalculateTotalsEquipmentVariantAction,
  UpdateTotalsEquipmentVariantAction
} from '../actions/equipment-variant.actions';
import { filter, map, switchMap, take, withLatestFrom } from 'rxjs/operators';
import { CalculateTotalsService } from '../../services/calculate-totals.service';
import { EquipmentItemActionTypes, UpdateEquipmentItemAction } from '../actions/equipment-item.actions';
import { EquipmentCollectionActionTypes, UpdateTotalsEquipmentCollectionAction } from '../actions/equipment-collection.actions';
import { EquipmentLimitsActionTypes } from '../actions/equipment-limits.actions';
import { EquipmentSetActionTypes, UpdateTotalsEquipmentSetAction } from '../actions/equipment-set.actions';

@Injectable()
export class UpdateTotalsEffects {

  @Effect() updateOnMove$: Observable<RecalculateTotalsEquipmentVariantAction> =
    this.actions.ofType(EquipmentVariantActionTypes.MOVE_ENTRY).pipe(
      map((action: MoveEntryEquipmentVariantAction) => action.payload.collectionId),
      withLatestFrom(this.store.select(selectEquipmentVariants)),
      map(([collectionId, variants]) => variants.selectedVariantIds[collectionId]),
      map(variantId => new RecalculateTotalsEquipmentVariantAction(variantId)),
    );

  @Effect() updateOnItemUpdate$: Observable<RecalculateTotalsEquipmentVariantAction> =
    this.actions.ofType(EquipmentItemActionTypes.UPDATE).pipe(
      map((action: UpdateEquipmentItemAction) => action.payload),
      withLatestFrom(this.store.select(selectEquipmentVariants)),
      map(([item, variants]) => ({variant: variants.entities[variants.selectedVariantIds[item.collectionId]], item})),
      filter(({item, variant}) => variant.entries.some(e => e.itemId === item.id)),
      map(({item, variant}) => new RecalculateTotalsEquipmentVariantAction(variant.id)),
    );

  @Effect() updateOnItemSelect$: Observable<RecalculateTotalsEquipmentVariantAction> =
    this.actions.ofType(EquipmentItemActionTypes.SELECT).pipe(
      map((action: UpdateEquipmentItemAction) => action.payload),
      withLatestFrom(this.store.select(selectEquipmentVariants)),
      map(([item, variants]) => ({variant: variants.entities[variants.selectedVariantIds[item.collectionId]], item})),
      map(({item, variant}) => new RecalculateTotalsEquipmentVariantAction(variant.id)),
    );

  @Effect() recalculateTotals$: Observable<UpdateTotalsEquipmentVariantAction> =
    this.actions.ofType(EquipmentVariantActionTypes.RECALCULATE_TOTALS).pipe(
      map((action: RecalculateTotalsEquipmentVariantAction) => action.payload),
      withLatestFrom(this.store.select(selectEquipmentVariants)),
      map(([variantId, variants]) => variants.entities[variantId]),
      withLatestFrom(this.store.select(selectEquipmentItems).pipe(map(items => items.entities))),
      withLatestFrom(this.store.select(selectEquipmentLimits).pipe(map(limits => (limits.ids as string[]).map(id => limits.entities[id])))),
      map(([[variant, items], limits]) => {
          const entries = this.calculateTotalsService.calculateTotalsForEntries(variant.entries, items, limits);
          return ({
            variantId: variant.id,
            entries,
            totals: entries[entries.length - 1].totals
          });
        }
      ),
      map(({variantId, entries, totals}) =>
        new UpdateTotalsEquipmentVariantAction({variantId, entries, totals}))
    );

  @Effect() onCollectionMoveUpdateTotals: Observable<any> =
    this.actions.ofType(EquipmentCollectionActionTypes.MOVE)
      .pipe(map(() => new UpdateTotalsEquipmentSetAction()));

  @Effect() updateCollectionTotals$: Observable<UpdateTotalsEquipmentCollectionAction> =
    this.actions.ofType(
        EquipmentVariantActionTypes.UPDATE_TOTALS,
        EquipmentSetActionTypes.UPDATE_TOTALS,
        ...Object.values(EquipmentLimitsActionTypes))
      .pipe(
        withLatestFrom(this.store.select(selectEquipmentCollections)),
        map(([action, collectionState]) => collectionState.order),
        withLatestFrom(this.store.select(selectEquipmentVariants)),
        map(([order, variants]) => ({
          order, totals: order.reduce((totals, id) => {
            totals[id] = variants.entities[variants.selectedVariantIds[id]].totals;
            return totals;
          }, {})
        })),
        withLatestFrom(this.store.select(selectEquipmentLimits).pipe(
          map(limits => (limits.ids as Array<string>).map(id => limits.entities[id])))
        ),
        map(([{order, totals}, limits]) =>
          this.calculateTotalsService.calculateTotalsForCollections(
            order,
            totals,
            limits)),
        map(totals => new UpdateTotalsEquipmentCollectionAction(totals))
      );


  constructor(private actions: Actions,
              private store: Store<{ equipmentSet: EquipmentSetState }>,
              private calculateTotalsService: CalculateTotalsService) {
  }

}
