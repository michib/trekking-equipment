import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { ActivatedRoute, Router } from '@angular/router';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/shareReplay';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/scan';
import { Collection } from '../shared/domain/collection';
import { CollectionService } from './shared/services/collection.service';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Entry } from '../shared/domain/entry';
import { SettingsService } from '../shared/service/settings.service';
import 'rxjs/add/observable/of';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { EntryLink, LinkType, LinkTypes } from '../shared/domain/link';
import { Variant } from '../shared/domain/variant';
import { Item } from '../shared/domain/item';
import { DragulaService } from 'ng2-dragula';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/withLatestFrom';
import { isNullOrUndefined } from 'util';

export interface Mapped {
  entity: Entry | Collection;
  selected: Item;
  acc_price: number;
  acc_weight: number;
}

@Component({
  selector: 'equip-equipment-list',
  templateUrl: './equipment-list.component.html',
  styleUrls: ['./equipment-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipmentListComponent implements OnInit {

  isNewList$: Observable<boolean>;
  private replay$ = new ReplaySubject<Collection>();
  collection: Collection;
  collection$ = this.replay$.asObservable().filter(collection => !!collection);
  form: FormGroup;

  linkType: typeof LinkType = LinkType;
  mappedEntities: Array<Mapped | {}>;

  notMappedEntries: Array<Entry>;

  newEntry = new Entry();

  constructor(private activatedRoute: ActivatedRoute,
              private collectionService: CollectionService,
              private formBuilder: FormBuilder,
              private settingsService: SettingsService,
              private changeDetectorRef: ChangeDetectorRef,
              private dragulaService: DragulaService,
              private router: Router) {
    dragulaService.drop.subscribe((value) => {
      const oldVariant = this.getSelectedVariant(this.collection);
      const entityLinks = [...this.getSelectedVariant(this.collection).entityLinks];
      const variant = {...oldVariant, entityLinks};
      const variantIndex = this.collection.variants.findIndex(v => v.id === oldVariant.id);
      const variants = [...this.collection.variants.slice(0, variantIndex), variant, ...this.collection.variants.slice(variantIndex + 1)];
      this.replay$.next({...this.collection, variants});
      this.changeDetectorRef.detectChanges();
    });;
  }

  log(msg: string, link: LinkTypes, index: number): void {
    console.log(`${msg}: ${index}`, link);
  }

  ngOnInit() {
    const id$ = this.activatedRoute.paramMap.map(map => map.get('id'));
    this.isNewList$ = id$.map(id => id === 'new');
    id$.switchMap(id => id === 'new' ? Observable.of(new Collection) : this.collectionService.get(id))
      .do(collection => {
        if (isNullOrUndefined(collection)) {
          this.router.navigate(['new']);
        }
      })
      .subscribe(collection => this.replay$.next(collection));
    // const col$ = Observable.of(TEST_COLLECTION).do(col => console.log('col source', col)).shareReplay();

    this.form = this.formBuilder.group({
      title: '',
      budget: '',
      weight: ''
    });

    this.form.valueChanges
      .subscribe(value => {
        this.replay$.next({...this.collection, ...value});
      });

    this.collection$
      .subscribe(collection => {
        this.collection = collection;

        this.mappedEntities = this.buildMappedEntities(this.collection);

        const mappedEntries = this.mappedEntities
          // .filter(e => (<Mapped>e).entity instanceof Entry) // TODO only use objects of type entry
          .map(e => (<Mapped>e).entity);

        console.log('mappedEntries', mappedEntries);
        this.notMappedEntries = collection.entries
          .filter(e => mappedEntries.findIndex(me => (<Entry>me).id === e.id) === -1);
      });

    this.collection$
      .map(collection => ({title: collection.title || '', budget: collection.budget || null, weight: collection.weight || null}))
      .scan((prev, settings) => Object.keys(settings).every(key => prev[key] === settings[key]) ? prev : settings)
      .distinctUntilChanged()
      .subscribe(settings => {
        this.form.setValue(settings);
      });

    this.collection$
      .map(collection => ({budget: collection.budget, weight: collection.weight}))
      .scan((prev, settings) => Object.keys(settings).every(key => prev[key] === settings[key]) ? prev : settings)
      .distinctUntilChanged()
      .subscribe(settings => {
        this.settingsService.updateSettings(settings);
      });
  }

  getSelectedVariant(collection: Collection): Variant {
    return collection.variants.find(v => v.id === collection.selectedVariantId);
  }

  getEntry(collection: Collection, linkId: Number): Entry {
    return collection.entries.find(e => e.id === linkId);
  }

  entryChanged(entry: Entry): void {
    const index = this.collection.entries.findIndex(e => e.id === entry.id);
    const entries = [...this.collection.entries.slice(0, index), entry, ...this.collection.entries.slice(index + 1)];
    console.log('entryChanged');
    this.replay$.next({...this.collection, entries});
  }


  trackByLinkId(index: number, link: LinkTypes): string {
    return `${link.linkType}_${link.entityId}`;
  }

  selectedIdChange(selectedId: number, index: number): void {
    const oldVariant = this.getSelectedVariant(this.collection);
    const oldLink = oldVariant.entityLinks[index];
    const entityLinks = [
      ...oldVariant.entityLinks.slice(0, index),
      {...oldLink, selectedId},
      ...oldVariant.entityLinks.slice(index + 1)
    ];
    const variant = {...oldVariant, entityLinks};
    const variantIndex = this.collection.variants.findIndex(v => v.id === oldVariant.id);
    const variants = [...this.collection.variants.slice(0, variantIndex), variant, ...this.collection.variants.slice(variantIndex + 1)];
    console.log('selectedIdChange');
    this.replay$.next({...this.collection, variants});
  }

  /* tslint:disable:member-ordering */
  private _oldEntityLinks: Array<LinkTypes>;
  private _oldEntries: Array<Entry>;
  /* tslint:enable:member-ordering */

  private buildMappedEntities(collection: Collection): Array<Mapped | {}> {
    const variant = this.getSelectedVariant(collection);
    if (!variant) {
      return this.mappedEntities || [];
    }

    let acc_price = 0;
    let acc_weight = 0;

    const mappedEntities = [];

    if (variant.entityLinks === this._oldEntityLinks && collection.entries === this._oldEntries) {
      return this.mappedEntities;
    }

    console.log('variant.entityLinks === this._oldEntityLinks', variant.entityLinks === this._oldEntityLinks);
    console.log('collection.entries === this._oldEntries', collection.entries === this._oldEntries);

    this._oldEntries = collection.entries;
    this._oldEntityLinks = variant.entityLinks;

    for (const link of variant.entityLinks) {
      if (link.linkType === LinkType.ENTRY) {
          const entry = collection.entries.find(e => e.id === link.entityId);
          if (!entry) {
            this.mappedEntities.push({

            });
            continue;
          }

          const item = entry.items.find(i => i.id === link.selectedId) || new Item();

          acc_price += item.price;
          acc_weight += item.weight;

          const mapped = {
            entity: entry,
            selected: item,
            acc_price: acc_price,
            acc_weight: acc_weight
          };

          mappedEntities.push(mapped);
      }
    }

    console.log('mappedEntities', mappedEntities);
    return mappedEntities;
  }

  addEntry(entry: Entry): void {
    entry = this.newEntry;
    const oldVariant = this.getSelectedVariant(this.collection);
    const link: EntryLink = {
      linkType: LinkType.ENTRY,
      entityId: entry.id,
      selectedId: entry.items && entry.items.length > 0 ? entry.items[0].id : null
    };
    const entityLinks = [
      ...oldVariant.entityLinks,
      link
    ];
    const variant = {...oldVariant, entityLinks};
    const variantIndex = this.collection.variants.findIndex(v => v.id === oldVariant.id);
    const variants = [...this.collection.variants.slice(0, variantIndex), variant, ...this.collection.variants.slice(variantIndex + 1)];
    const entries = [...this.collection.entries, entry];
    this.replay$.next({...this.collection, variants, entries});

    this.newEntry = new Entry();
    this.changeDetectorRef.detectChanges();
  }

  save(): void {
    this.collectionService
      .save(this.collection)
      .withLatestFrom(this.isNewList$)
      .subscribe(([collection, isNewList]) => {
        if (isNewList) {
          this.router.navigate([collection._id]);
        } else {
          this.collection = collection;
        }
      });
  }
}