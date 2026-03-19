export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export interface Animation {
  id: string;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
}

export class AnimationQueue {
  private active: Animation[] = [];
  private resolvers: Array<() => void> = [];

  add(anim: Animation): void {
    this.active.push(anim);
  }

  tick(dt: number): boolean {
    if (this.active.length === 0) return false;

    const completed: Animation[] = [];

    for (const anim of this.active) {
      anim.elapsed += dt;
      const rawProgress = Math.min(anim.elapsed / anim.duration, 1);
      const progress = anim.easing(rawProgress);
      anim.onUpdate(progress);

      if (rawProgress >= 1) {
        completed.push(anim);
      }
    }

    for (const anim of completed) {
      this.active = this.active.filter((a) => a !== anim);
      anim.onComplete?.();
    }

    if (this.active.length === 0) {
      for (const resolve of this.resolvers) {
        resolve();
      }
      this.resolvers = [];
    }

    return this.active.length > 0;
  }

  get isAnimating(): boolean {
    return this.active.length > 0;
  }

  waitForAll(): Promise<void> {
    if (this.active.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  clear(): void {
    this.active = [];
    for (const resolve of this.resolvers) {
      resolve();
    }
    this.resolvers = [];
  }
}
