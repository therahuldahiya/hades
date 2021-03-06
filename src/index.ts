import Aion from '@adoratorio/aion';
import Hermes from '@adoratorio/hermes';
import { HermesEvent } from '@adoratorio/hermes/dist/declarations';
import {
  MODE,
  DIRECTION,
  TRACK,
  HadesOptions,
  Boundries,
  Vec2,
  Timeline,
  Easing,
} from "./declarations";
import Easings from "./easing";
import Scrollbar from "./scrollbar";

class Hades {
  static EASING = Easings;
  static MODE = MODE;
  static DIRECTION = DIRECTION;
  static TRACK = TRACK;

  private _amount : Vec2 = { x: 0, y: 0 };

  private options : HadesOptions;
  private engine : Aion;
  private manager : Hermes;
  private scrollHandler : Function;
  private frameHandler : Function;
  private timeline : Timeline;
  private prevDirection : Vec2 = { x: Hades.DIRECTION.INITIAL, y: Hades.DIRECTION.INITIAL };
  private prevAmount : Vec2 = { x: 0, y: 0 };
  private sections : Array<HTMLElement> = [];
  private automaticScrolling : boolean = false;
  private imediateScrolling : boolean = false;
  private scrollbar : Scrollbar | null = null;
  private stopNeedEmission : boolean = false;
  private startNeedEmission : boolean = true;

  public amount : Vec2 = { x: 0, y: 0 };
  public velocity : Vec2 = { x: 0, y: 0 };
  public running : boolean = false;
  public still : boolean = true;

  constructor(options : Partial<HadesOptions>) {
    const defaults : HadesOptions = {
      mode: MODE.VIRTUAL,
      viewport: document.querySelector('.hades-viewport') as HTMLElement,
      container: document.querySelector('.hades-container') as HTMLElement,
      easing: {
        mode: Easings.LINEAR,
        duration: 1000,
      },
      infiniteScroll: false,
      emitGlobal: true,
      callbacks: {
        frame: () => {},
        scroll: () => {},
      },
      renderByPixel: true,
      lockX: true,
      lockY: false,
      boundries: Hades.createBoundries(0, 0, 0, 0),
      autoBoundries: true,
      sections: false,
      autoplay: true,
      aion: null,
      touchMultiplier: 1.5,
      smoothDirectionChange: false,
      renderScroll: true,
      scrollbar: {
        tracks: [TRACK.Y],
      },
      scale: 1,
      uniqueDirection: false,
    };
    this.options = { ...defaults, ...options };
    if (typeof this.options.callbacks.frame === 'undefined') this.options.callbacks.frame = () => {};
    if (typeof this.options.callbacks.scroll === 'undefined') this.options.callbacks.scroll = () => {};

    this.timeline = {
      start: 0,
      duration: this.options.easing.duration,
      initial: { x: 0, y: 0 },
      final: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
    };
    this.scrollHandler = (event : HermesEvent) => this.scroll(event);
    this.frameHandler = (delta : number) => this.frame(delta);

    if (this.options.viewport === null || typeof this.options.viewport === 'undefined') {
      throw new Error('Viewport cannot be undefined');
    }
    if (this.options.container === null || typeof this.options.container === 'undefined') {
      throw new Error('Container cannot be undefined');
    }

    // If sections are setted load the nodes
    if (this.virtual && this.options.sections) {
      const selector = typeof this.options.sections === 'string' ? this.options.sections : '.hades-section';
      this.sections = Array.from(document.querySelectorAll(selector)) as Array<HTMLElement>;
    }

    // Set base css for performance boost
    this.options.container.style.webkitBackfaceVisibility = 'hidden';
    this.options.container.style.backfaceVisibility = 'hidden';

    // Atach and listen to events
    this.manager = new Hermes({
      mode: this.options.mode,
      container: window,
      touchMultiplier: this.options.touchMultiplier,
    });
    this.manager.on(this.scrollHandler);

    // Check and initialize Aion
    if (this.options.autoplay) this.running = true;
    if (this.options.aion === null || typeof this.options.aion === 'undefined') {
      this.engine = new Aion();
    } else {
      this.engine = this.options.aion;
    }

    if (this.options.scrollbar !== null && this.options.mode === Hades.MODE.VIRTUAL) {
      this.scrollbar = new Scrollbar(this.options.scrollbar, this, this.options.viewport);
    }

    this.engine.add(this.frameHandler, 'hades_frame');
    this.engine.start();
  }

  private frame(delta : number) : void {
    // If boundires are autosetted use the container dimensions
    if (this.options.autoBoundries) {
      const containerRect = this.options.container.getBoundingClientRect();
      const viewportRect = this.virtual ? this.options.viewport.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      this.options.boundries = Hades.createBoundries(
        0,
        containerRect.width < viewportRect.width ? 0 : containerRect.width - viewportRect.width,
        0,
        containerRect.height < viewportRect.height ? 0 : containerRect.height - viewportRect.height,
      );
    }

    // Get the new final value
    this.timeline.final.x = this._amount.x;
    this.timeline.final.y = this._amount.y;

    // Normalize delta based on duration
    delta = Math.min(Math.max(delta, 0), this.options.easing.duration);

    // Normalize the delta to be 0 - 1
    let time = delta / this.timeline.duration;

    // Check if the frame is imediate
    if (this.imediateScrolling) {
      time = 1;
      this.imediateScrolling = false;
    }

    // Get the interpolated time
    time = this.options.easing.mode(time);

    // Use the interpolated time to calculate values
    this.timeline.current.x = this.timeline.initial.x + (time * (this.timeline.final.x - this.timeline.initial.x));
    this.timeline.current.y = this.timeline.initial.y + (time * (this.timeline.final.y - this.timeline.initial.y));
    const current : Vec2 = {
      x: this.timeline.current.x,
      y: this.timeline.current.y,
    };
    const roundedCurrent : Vec2 = {
      x: Math.round(this.timeline.current.x),
      y: Math.round(this.timeline.current.y),
    }
    this.amount = this.options.renderByPixel ? roundedCurrent : current;

    // Apply transformation in case of non section method
    if (this.virtual && this.options.renderScroll && !this.options.sections) {
      const px = this.options.lockX ? 0 : this.amount.x * -1;
      const py = this.options.lockY ? 0 : this.amount.y * -1;
      const prop = `translate3d(${px}px, ${py}px, 0px)`;
      this.options.container.style.transform = prop;
    }

    // Calculate transform based on prev frame amount and transform if section method
    if (this.virtual && this.options.sections) {
      const sectionsHeight : Array<number> = [];
      this.sections.forEach((section) => sectionsHeight.push(section.getBoundingClientRect().height));
      this.sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        let prevSectionsHeight = 0;
        for (let i = 0; i < index; i++) prevSectionsHeight += sectionsHeight[i];
        // Check if we need to translate this section
        if (
          this.prevAmount.y > (prevSectionsHeight - window.innerHeight) &&
          ((prevSectionsHeight + rect.height) - window.innerHeight) > 0
        ) {
          const py = this.amount.y * -1;
          section.style.transform = `translate3d(0px, ${py}px, 0px)`;
        }
      });
    }

    // Calculate the speed
    this.velocity = {
      x: Math.abs((current.x - this.prevAmount.x) / delta),
      y: Math.abs((current.y - this.prevAmount.y) / delta),
    }
    // Use 4 digits precision
    this.velocity.x = parseFloat(this.velocity.x.toFixed(4));
    this.velocity.y = parseFloat(this.velocity.y.toFixed(4));
    this.prevAmount = current;

    // Check if the scroll is still animating or not
    if (this.velocity.y === 0 && this.velocity.x === 0) {
      this.still = true;
      if (this.stopNeedEmission) {
        this.emitStillChange('stop');
        this.stopNeedEmission = false;
        this.startNeedEmission = true;
      }
    } else {
      this.still = false;
      if (this.startNeedEmission) {
        this.emitStillChange('start');
        this.startNeedEmission = false;
        this.stopNeedEmission = true;
      }
    }

    // Update scrollbar tracks
    if (this.options.scrollbar !== null && this.scrollbar !== null) {
      this.scrollbar.listen(this.amount);
    }

    // Reset the initial position of the timeline for the next frame
    this.timeline.initial = this.timeline.current;
    this.options.callbacks.frame();
  }

  private scroll(event : HermesEvent) : void {
    // Return if is stopped
    if (!this.running) return;

    // Reset from the scroll to if needed
    if (this.automaticScrolling) {
      this.timeline.duration = this.options.easing.duration;
      this.amount = this.prevAmount;
      this.automaticScrolling = false;
    }

    // Multiply the scroll by the options multiplier
    event.delta.x = this.options.uniqueDirection ? (event.delta.x || event.delta.y) * this.options.scale : event.delta.x * this.options.scale;
    event.delta.y = event.delta.y * this.options.scale;

    // Set the first scroll direction
    if (this.prevDirection.x === Hades.DIRECTION.INITIAL || this.prevDirection.y === Hades.DIRECTION.INITIAL) {
      this.prevDirection.x = event.delta.x > 0 ? Hades.DIRECTION.DOWN : Hades.DIRECTION.UP;
      this.prevDirection.y = event.delta.y > 0 ? Hades.DIRECTION.DOWN : Hades.DIRECTION.UP;
    }

    // Temporary sum amount
    const tempX = this._amount.x + event.delta.x;
    const tempY = this._amount.y + event.delta.y;

    // Clamp the sum amount to be inside the boundries if not infinite scrolling
    if (!this.options.infiniteScroll) {
      this._amount.x = Math.min(Math.max(tempX, this.options.boundries.min.x), this.options.boundries.max.x);
      this._amount.y = Math.min(Math.max(tempY, this.options.boundries.min.y), this.options.boundries.max.y);
    } else {
      this._amount.x = tempX;
      this._amount.y = tempY;
    }

    // Check the scroll direction
    const currentXDirection = event.delta.x > 0 ? Hades.DIRECTION.DOWN : Hades.DIRECTION.UP;
    const currentYDirection = event.delta.y > 0 ? Hades.DIRECTION.DOWN : Hades.DIRECTION.UP;
    if (!this.options.smoothDirectionChange) {
      if (currentXDirection !== this.prevDirection.x) this._amount.x = this.amount.x;
      if (currentYDirection !== this.prevDirection.y) this._amount.y = this.amount.y;
    }
    this.prevDirection.x = currentXDirection;
    this.prevDirection.y = currentYDirection;
    
    // Emit the event and call the callback
    if (this.options.emitGlobal) {
      const eventInit : CustomEventInit = {};
      eventInit.detail = event;
      const customEvent : CustomEvent = new CustomEvent('hades-scroll', eventInit);
      window.dispatchEvent(customEvent);
    }
    this.options.callbacks.scroll(event);
  }

  private emitStillChange(type : string) {
    if (this.options.emitGlobal) {
      const eventInit : CustomEventInit = {};
      const customEvent : CustomEvent = new CustomEvent(`hades-${type}`, eventInit);
      window.dispatchEvent(customEvent);
    }
  }

  public scrollTo(position : Partial<Vec2>, duration : number) {
    if (this.virtual) {
      if (duration > 0) {
        this.automaticScrolling = true;
        this.timeline.duration = duration;
      } else {
        this.imediateScrolling = true;
      }
    } else {
      window.scroll({
        left: position.x,
        top: position.y,
        behavior: duration === 0 ? 'auto' : 'smooth',
      });
    }
    if (typeof position.x !== 'undefined') this._amount.x = position.x;
    if (typeof position.y !== 'undefined') this._amount.y = position.y;
  }

  public play() {
    this.running = true;
  }

  public pause() {
    this.running = false;
  }

  public destroy() {
    if (this.scrollbar !== null) this.scrollbar.destroy();
    this.manager.destroy();
    this.engine.remove('hades_frame');

    delete this.manager;
    delete this.engine;
  }

  // Common getter for retriving props

  public get virtual() {
    return this.options.mode === Hades.MODE.VIRTUAL;
  }

  public get fake() {
    return this.options.mode === Hades.MODE.FAKE;
  }

  public get native() {
    return this.options.mode === Hades.MODE.NATIVE;
  }

  public get direction() {
    return this.prevDirection;
  }

  public get boundries() {
    return this.options.boundries;
  }

  // Common getters for setting option on the fly

  public set easing(easing : Easing) {
    this.options.easing = easing;
  }

  public set infiniteScroll(infiniteScroll : boolean) {
    this.options.infiniteScroll = infiniteScroll;
  }

  public set emitGlobal(emitGlobal : boolean) {
    this.options.emitGlobal = emitGlobal;
  }

  public set boundries(boundries : Boundries) {
    this.options.boundries = boundries;
    if (this._amount.y > this.options.boundries.max.y) {
      this.scrollTo({ y: this.options.boundries.max.y }, 0);
    }
    if (this._amount.x > this.options.boundries.max.x) {
      this.scrollTo({ x: this.options.boundries.max.x }, 0);
    }
  }

  public set touchMultiplier(touchMultiplier : number) {
    this.options.touchMultiplier = touchMultiplier;
  }

  public set smoothDirectionChange(smoothDirectionChange : boolean) {
    this.options.smoothDirectionChange = smoothDirectionChange;
  }

  public set renderScroll(renderScroll : boolean) {
    this.options.renderScroll = renderScroll;
  }

  // Some utils

  public static createBoundries(xMin : number, xMax : number, yMin : number, yMax : number) : Boundries {
    const boundries : Boundries = {
      min: { x: xMin, y: yMin },
      max: { x: xMax, y: yMax }
    };
    return boundries;
  }
}

export default Hades;