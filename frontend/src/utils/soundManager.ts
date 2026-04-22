export type BgmType = 'lobby' | 'ingame';

const BGM_SOURCE: Record<BgmType, string> = {
    lobby: '/sounds/bgm/lobby.ogg',
    ingame: '/sounds/bgm/ingame.ogg',
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

    ensureBgm(type: BgmType) {
        if (typeof window === 'undefined') return;
        if (this.bgmType === type && this.bgmAudio) {
            if (this.bgmAudio.paused) {
                this.bgmAudio.play().catch(() => undefined);
            }
            return;
        }

        this.switchBgm(type);
    }

    private async switchBgm(type: BgmType) {
        const token = ++this.bgmToken;
        const nextAudio = new Audio(BGM_SOURCE[type]);
        nextAudio.preload = 'auto';
        nextAudio.loop = true;
        nextAudio.volume = 0;

        try {
            await nextAudio.play();
        } catch {
            if (token === this.bgmToken) {
                this.bgmType = type;
                this.bgmAudio = nextAudio;
            }
            return;
        }

        if (token !== this.bgmToken) {
            nextAudio.pause();
            nextAudio.currentTime = 0;
            return;
        }

        const previous = this.bgmAudio;
        this.bgmAudio = nextAudio;
        this.bgmType = type;

        this.fadeIn(nextAudio, DEFAULT_BGM_VOLUME, 500);

        if (previous) {
            await fadeOutAudio(previous, 500);
        }
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
}

export const soundManager = new SoundManager();