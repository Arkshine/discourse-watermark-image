import Component from "@glimmer/component";
import { concat, fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { debounce } from "@ember/runloop";
import { bind } from "discourse/lib/decorators";
import dIcon from "discourse/ui-kit/helpers/d-icon";

const PREVIEW_DEBOUNCE = 100;

export default class WatermarkAxisGallery extends Component {
  willDestroy() {
    super.willDestroy(...arguments);
    this.clearPreview();
  }

  get expanded() {
    return this.args.expanded ?? false;
  }

  get open() {
    return this.args.open ?? this.expanded;
  }

  get options() {
    return (this.args.options ?? []).map((option) => ({
      ...option,
      active: option.key === this.args.value,
    }));
  }

  get selected() {
    return this.args.options?.find((option) => option.key === this.args.value);
  }

  @action
  toggle() {
    if (this.args.disabled) {
      return;
    }

    if (this.expanded) {
      this.clearPreview();
    }

    this.args.onToggle?.();
  }

  @action
  focusSelected(element) {
    element.querySelector('[role="radio"][tabindex="0"]')?.focus();
  }

  @action
  navigate(event) {
    const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = steps[event.key];
    const jump = event.key === "Home" || event.key === "End";

    if (event.key === "Escape") {
      this.toggle();
      return;
    }

    if (!step && !jump) {
      return;
    }

    const tiles = [...event.currentTarget.querySelectorAll('[role="radio"]')];

    if (!tiles.length) {
      return;
    }

    event.preventDefault();

    const current = Math.max(0, tiles.indexOf(document.activeElement));
    let next;

    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tiles.length - 1;
    } else {
      next = (current + step + tiles.length) % tiles.length;
    }

    tiles[next].focus();
  }

  @action
  preview(key) {
    debounce(this, this.#emitPreview, key, PREVIEW_DEBOUNCE);
  }

  @bind
  clearPreview() {
    debounce(this, this.#emitPreview, null, PREVIEW_DEBOUNCE);
  }

  #emitPreview(key) {
    this.args.onPreview?.(key);
  }

  @action
  select(key) {
    this.clearPreview();

    if (key !== this.args.value) {
      this.args.onSelect(key);
    }

    this.args.onToggle?.();
  }

  <template>
    <div
      class="watermark-axis-gallery {{if @disabled '--disabled'}}"
      ...attributes
    >
      {{#if @label}}
        <div class="watermark-axis-gallery__label">{{@label}}</div>
      {{/if}}

      {{#unless this.expanded}}
        <div
          class="watermark-axis-gallery__grid --trigger
            {{if @compact '--compact'}}"
        >
          <button
            type="button"
            class="watermark-axis-gallery__swatch --selected
              {{if this.open '--open'}}"
            aria-expanded={{if this.open "true" "false"}}
            aria-disabled={{if @disabled "true" "false"}}
            aria-label={{if @compact (concat @label ": " this.selected.label)}}
            {{on "click" this.toggle}}
          >
            {{#if this.selected.image}}
              <img
                class="watermark-axis-gallery__motif"
                src={{this.selected.image}}
                alt=""
              />
            {{else}}
              {{dIcon this.selected.icon class="watermark-axis-gallery__motif"}}
            {{/if}}
            {{#unless @compact}}
              <span class="watermark-axis-gallery__name">
                {{this.selected.label}}
              </span>
            {{/unless}}
            <span class="watermark-axis-gallery__caret">{{dIcon
                "chevron-down"
              }}</span>
          </button>
        </div>

        {{#if @disabled}}
          {{#if @disabledReason}}
            <div class="watermark-axis-gallery__disabled-reason">
              {{@disabledReason}}
            </div>
          {{/if}}
        {{/if}}
      {{/unless}}

      {{#if this.expanded}}
        <div
          class="watermark-axis-gallery__grid {{if @compact '--compact'}}"
          role="radiogroup"
          {{didInsert this.focusSelected}}
          {{on "keydown" this.navigate}}
          {{on "mouseleave" this.clearPreview}}
          {{on "focusout" this.clearPreview}}
        >
          {{#each this.options key="key" as |option|}}
            {{#if option.separatorBefore}}
              <div class="watermark-axis-gallery__separator">
                <span class="watermark-axis-gallery__separator-badge">Aa</span>
              </div>
            {{/if}}
            <button
              type="button"
              class="watermark-axis-gallery__swatch
                {{if option.active '--active'}}"
              role="radio"
              aria-checked={{if option.active "true" "false"}}
              tabindex={{if option.active "0" "-1"}}
              aria-label={{if @compact option.label}}
              {{on "click" (fn this.select option.key)}}
              {{on "mouseenter" (fn this.preview option.key)}}
              {{on "focusin" (fn this.preview option.key)}}
            >
              {{#if option.image}}
                <img
                  class="watermark-axis-gallery__motif"
                  src={{option.image}}
                  alt=""
                />
              {{else}}
                {{dIcon option.icon class="watermark-axis-gallery__motif"}}
              {{/if}}
              {{#unless @compact}}
                <span
                  class="watermark-axis-gallery__name"
                >{{option.label}}</span>
              {{/unless}}
            </button>
          {{/each}}
        </div>
      {{/if}}
    </div>
  </template>
}
