import { trackedObject } from "@ember/reactive/collections";
import WatermarkManualToggle from "../../components/watermark-manual-toggle";

const MENU_PADDING = 8;

class ManualTogglePluginView {
  #menuInstance;
  #view;
  #appEvents;
  #getContext;
  #images = new Map();
  #onImagesChanged;
  #NodeSelection;
  #element = null;
  #state = null;
  #opening = false;

  constructor({ pmState: { NodeSelection }, getContext }) {
    this.#getContext = getContext;
    this.#NodeSelection = NodeSelection;

    const { appEvents } = getContext();
    this.#appEvents = appEvents;

    this.#onImagesChanged = (list) => {
      this.#images = new Map(list.map((image) => [image.shortUrl, image]));
      if (this.#view) {
        this.update(this.#view);
      }
    };

    appEvents.on("discourse-watermark:images-changed", this.#onImagesChanged);
    appEvents.trigger("discourse-watermark:rte-mounted");
  }

  update(view) {
    this.#view = view;

    const { selection } = view.state;
    const isImageSelection =
      selection instanceof this.#NodeSelection &&
      selection.node.type.name === "image";

    if (!isImageSelection) {
      this.#closeToolbar();
      return;
    }

    const shortUrl = selection.node.attrs.originalSrc;
    const image = this.#images.get(shortUrl);

    if (!image) {
      return;
    }

    const element = view.nodeDOM(selection.from);
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (element === this.#element && this.#state) {
      this.#state.shortUrl = shortUrl;
      this.#state.applied = image.applied;
      this.#state.processing = image.processing;
      this.#state.available = image.available;
      this.#state.profileName = image.profileName;
      this.#state.options = image.options;
      return;
    }

    const ordinal = this.#ordinalFor(view, selection.from, shortUrl);
    this.#openToolbar(element, image, shortUrl, ordinal);
  }

  #ordinalFor(view, pos, shortUrl) {
    let ordinal = 0;
    let found = false;

    view.state.doc.descendants((node, nodePos) => {
      if (found) {
        return false;
      }

      if (
        node.type.name === "image" &&
        (node.attrs.originalSrc === shortUrl || node.attrs.src === shortUrl)
      ) {
        if (nodePos === pos) {
          found = true;
          return false;
        }
        ordinal++;
      }
    });

    return ordinal;
  }

  async #openToolbar(element, image, shortUrl, ordinal) {
    if (this.#opening) {
      return;
    }
    this.#opening = true;

    try {
      const state = trackedObject({
        shortUrl,
        applied: image.applied,
        processing: image.processing,
        available: image.available,
        profileName: image.profileName,
        options: image.options,
        ordinal,
      });
      this.#state = state;
      this.#element = element;

      const data = {
        state,
        context: "rte",
        toggle: (currentShortUrl) =>
          this.#appEvents.trigger(
            "discourse-watermark:toggle-request",
            currentShortUrl,
            state.ordinal
          ),
        pick: (currentShortUrl, profileName) =>
          this.#appEvents.trigger(
            "discourse-watermark:pick-request",
            currentShortUrl,
            state.ordinal,
            profileName
          ),
        applyAll: (currentShortUrl) =>
          this.#appEvents.trigger(
            "discourse-watermark:apply-all-request",
            currentShortUrl
          ),
      };

      this.#menuInstance = this.#getContext().menu.newInstance(element, {
        identifier: "watermark-manual-toggle",
        component: WatermarkManualToggle,
        placement: "top-end",
        fallbackPlacements: ["top-end"],
        padding: MENU_PADDING,
        data,
        portalOutletElement: element,
        closeOnClickOutside: false,
        closeOnEscape: false,
        closeOnScroll: false,
        trapTab: false,
        offset({ rects }) {
          return {
            mainAxis: -MENU_PADDING - rects.floating.height,
            crossAxis: -MENU_PADDING,
          };
        },
      });
      await this.#menuInstance.show();
    } finally {
      this.#opening = false;
    }
  }

  #closeToolbar() {
    this.#element = null;
    this.#state = null;

    const instance = this.#menuInstance;
    this.#menuInstance = null;
    instance?.destroy();
  }

  destroy() {
    this.#appEvents.off(
      "discourse-watermark:images-changed",
      this.#onImagesChanged
    );
    this.#closeToolbar();
  }
}

const extension = {
  plugins({ pmState: { Plugin, NodeSelection }, getContext }) {
    return [
      new Plugin({
        view() {
          return new ManualTogglePluginView({
            pmState: { NodeSelection },
            getContext,
          });
        },
      }),
    ];
  },
};

export default extension;
