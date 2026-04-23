export type BgmType = 'lobby' | 'ingame';

const BGM_SOURCE: Record<BgmType, string[]> = {
    lobby: ['/sounds/bgm/lobby.ogg', '/sounds/bgm/lobby.mp3'],
    ingame: ['/sounds/bgm/ingame.ogg'],
};

const DEFAULT_BGM_VOLUME = 0.4;
const PLACE_VOLUME = 1;

function fadeOutAudio(audio: HTMLAudioElement, durationMs = 450): Promise<void> {
    return new Promise((resolve) => {
        const startVolume = Math.max(0, Math.min(1, audio.volume));
        if (startVolume <= 0) {
            audio.pause();
            audio.currentTime = 0;
            resolve();
            return;
        }

        const stepMs = 50;
        const steps = Math.max(1, Math.ceil(durationMs / stepMs));
        let currentStep = 0;
        const timer = window.setInterval(() => {
            currentStep += 1;
            const nextVolume = Math.max(0, startVolume * (1 - currentStep / steps));
            audio.volume = nextVolume;
            if (currentStep >= steps) {
                window.clearInterval(timer);
                audio.pause();
                audio.currentTime = 0;
                audio.volume = startVolume;
                resolve();
            }
        }, stepMs);
    });
}

class SoundManager {
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmType: BgmType | null = null;
    private bgmToken = 0;
    private placementAudio: HTMLAudioElement | null = null;
    private pendingBgmType: BgmType | null = null;
    private unlockListenersAttached = false;

    async ensureBgm(type: BgmType): Promise<void> {
        if (typeof window === 'undefined') return;
        if (this.bgmType === type && this.bgmAudio) {
            if (this.bgmAudio.paused) {
                try {
                    await this.bgmAudio.play();
                    this.pendingBgmType = null;
                    this.detachUnlockListeners();
                } catch {
                    this.pendingBgmType = type;
                    this.attachUnlockListeners();
                }
            }
            return;
        }

        await this.switchBgm(type);
    }

    private async switchBgm(type: BgmType) {
        const token = ++this.bgmToken;
        const nextAudio = new Audio(this.pickBgmSource(type));
        nextAudio.preload = 'auto';
        nextAudio.loop = true;
        nextAudio.volume = 0;

        const previous = this.bgmAudio;
        this.bgmAudio = nextAudio;
        this.bgmType = type;
        this.pendingBgmType = null;

        if (previous) {
            await fadeOutAudio(previous, 500);
        }

        try {
            await nextAudio.play();
        } catch {
            if (token === this.bgmToken) {
                this.pendingBgmType = type;
                this.attachUnlockListeners();
            }
            return;
        }

        if (token !== this.bgmToken) {
            nextAudio.pause();
            nextAudio.currentTime = 0;
            return;
        }

        this.pendingBgmType = null;
        this.detachUnlockListeners();

        this.fadeIn(nextAudio, DEFAULT_BGM_VOLUME, 500);
    }

    private fadeIn(audio: HTMLAudioElement, targetVolume: number, durationMs = 500) {
        const volume = Math.max(0, Math.min(1, targetVolume));
        audio.volume = 0;

        const stepMs = 50;
        const steps = Math.max(1, Math.ceil(durationMs / stepMs));
        let currentStep = 0;

        const timer = window.setInterval(() => {
            currentStep += 1;
            audio.volume = Math.min(volume, volume * (currentStep / steps));
            if (currentStep >= steps) {
                window.clearInterval(timer);
                audio.volume = volume;
            }
        }, stepMs);
    }

    async playPlacementSound(soundUrl: string) {
        if (typeof window === 'undefined') return;

        const nextAudio = new Audio(soundUrl);
        nextAudio.preload = 'auto';
        nextAudio.volume = PLACE_VOLUME;

        const previous = this.placementAudio;
        this.placementAudio = nextAudio;

        if (previous) {
            await fadeOutAudio(previous, 350);
        }

        try {
            await nextAudio.play();
        } catch {
            if (this.placementAudio === nextAudio) {
                this.placementAudio = null;
            }
            return;
        }

        nextAudio.addEventListener('ended', () => {
            if (this.placementAudio === nextAudio) {
                this.placementAudio = null;
            }
        }, { once: true });
    }

    async playCardVoice(params: { heroKey?: string | null; spellKey?: string | null; isSpell?: boolean }) {
        const isSpell = !!params.isSpell;
        const key = isSpell ? params.spellKey : params.heroKey;
        if (!key) return;
        const soundUrl = isSpell
            ? `/sounds/skills/${key}/place.ogg`
            : `/sounds/heroes/${key}/place.ogg`;
        await this.playPlacementSound(soundUrl);
    }

    private pickBgmSource(type: BgmType): string {
        const [defaultSource, ...fallbacks] = BGM_SOURCE[type];
        const probe = new Audio();
        const sources = [defaultSource, ...fallbacks];
        return sources.find((source) => {
            if (source.endsWith('.ogg')) return probe.canPlayType('audio/ogg; codecs="vorbis"') !== '';
            if (source.endsWith('.mp3')) return probe.canPlayType('audio/mpeg') !== '';
            return false;
        }) ?? defaultSource;
    }

    private attachUnlockListeners() {
        if (this.unlockListenersAttached || typeof window === 'undefined') return;
        window.addEventListener('pointerdown', this.ensurePendingUnlock);
        window.addEventListener('touchstart', this.ensurePendingUnlock);
        window.addEventListener('click', this.ensurePendingUnlock);
        window.addEventListener('keydown', this.ensurePendingUnlock);
        this.unlockListenersAttached = true;
    }

    private detachUnlockListeners() {
        if (!this.unlockListenersAttached || typeof window === 'undefined') return;
        window.removeEventListener('pointerdown', this.ensurePendingUnlock);
        window.removeEventListener('touchstart', this.ensurePendingUnlock);
        window.removeEventListener('click', this.ensurePendingUnlock);
        window.removeEventListener('keydown', this.ensurePendingUnlock);
        this.unlockListenersAttached = false;
    }

    private ensurePendingUnlock = async () => {
        const pendingType = this.pendingBgmType;
        if (!pendingType) return;
        await this.ensureBgm(pendingType);
        if (this.pendingBgmType === null) {
            this.detachUnlockListeners();
        }
    };
}

export const soundManager = new SoundManager();