type CardLike = {
    id?: string | number | null;
    hero_key?: string | number | null;
    name?: string | number | null;
    is_spell?: boolean;
    role?: 'tank' | 'dealer' | 'healer' | string | null;
};

const HERO_ID_ALIAS: Record<string, string> = {
    soldier76: 'soldier_76',
    soldier_76: 'soldier_76',
    junkerqueen: 'junker_queen',
    junker_queen: 'junker_queen',
    wreckingball: 'wrecking_ball',
    wrecking_ball: 'wrecking_ball',
    jetpackcat: 'jetpack_cat',
    jetpack_cat: 'jetpack_cat',
    torbjorn_turret: 'torbjorn',
    illari_pylon: 'illari',

    reinhardt: 'reinhardt',
    winston: 'winston',
    zarya: 'zarya',
    dva: 'dva',
    hana_song: 'hana_song',
    doomfist: 'doomfist',
    sigma: 'sigma',
    roadhog: 'roadhog',
    ramattra: 'ramattra',
    orisa: 'orisa',
    mauga: 'mauga',
    domina: 'domina',
    hazard: 'hazard',

    bastion: 'bastion',
    tracer: 'tracer',
    venture: 'venture',
    sombra: 'sombra',
    symmetra: 'symmetra',
    widowmaker: 'widowmaker',
    hanzo: 'hanzo',
    echo: 'echo',
    ash: 'ashe',
    ashe: 'ashe',
    cassidy: 'cassidy',
    reaper: 'reaper',
    mei: 'mei',
    torbjorn: 'torbjorn',
    sojourn: 'sojourn',
    junkrat: 'junkrat',
    genji: 'genji',
    anran: 'anran',
    vendetta: 'vendetta',

    ana: 'ana',
    baptiste: 'baptiste',
    lucio: 'lucio',
    brigitte: 'brigitte',
    mercy: 'mercy',
    juno: 'juno',
    mizuki: 'mizuki',
    wuyang: 'wuyang',
    zenyatta: 'zenyatta',
    moira: 'moira',
    illari: 'illari',
    kiriko: 'kiriko',
    lifeweaver: 'lifeweaver',

    freya: 'freja',
    freja: 'freja',
    pharah: 'pharah',
    emre: 'emre',
};

const HERO_NAME_ALIAS: Record<string, string> = {
    아나: 'ana',
    안란: 'anran',
    애쉬: 'ashe',
    바티스트: 'baptiste',
    바스티온: 'bastion',
    브리기테: 'brigitte',
    캐서디: 'cassidy',
    도미나: 'domina',
    둠피스트: 'doomfist',
    디바: 'dva',
    송하나: 'hana_song',
    에코: 'echo',
    엠레: 'emre',
    프레야: 'freja',
    겐지: 'genji',
    한조: 'hanzo',
    해저드: 'hazard',
    일리아리: 'illari',
    힐포탑: 'illari',
    토르비욘포탑: 'torbjorn',
    제트팩캣: 'jetpack_cat',
    정커퀸: 'junker_queen',
    정크랫: 'junkrat',
    주노: 'juno',
    키리코: 'kiriko',
    라위: 'lifeweaver',
    라이프위버: 'lifeweaver',
    루시우: 'lucio',
    마우가: 'mauga',
    메이: 'mei',
    메르시: 'mercy',
    미즈키: 'mizuki',
    모이라: 'moira',
    오리사: 'orisa',
    파라: 'pharah',
    라마트라: 'ramattra',
    리퍼: 'reaper',
    라인하르트: 'reinhardt',
    로드호그: 'roadhog',
    시그마: 'sigma',
    소전: 'sojourn',
    솔저: 'soldier_76',
    솔져: 'soldier_76',
    솜브라: 'sombra',
    시메트라: 'symmetra',
    토르비욘: 'torbjorn',
    트레이서: 'tracer',
    벤데타: 'vendetta',
    벤처: 'venture',
    위도우: 'widowmaker',
    위도우메이커: 'widowmaker',
    윈스턴: 'winston',
    레킹볼: 'wrecking_ball',
    우양: 'wuyang',
    자리야: 'zarya',
    젠야타: 'zenyatta',
};

const SPELL_ALIAS: Record<string, string> = {
    // Korean names
    '가시소나기': 'thorn_barrage',
    '눈보라': 'blizzard',
    '대지분쇄': 'earthshatter',
    '중력붕괴': 'gravity_flux',
    '생체수류탄': 'biotic_grenade',
    '구원의손길': 'rescue',
    '소리방벽': 'sound_barrier',
    '증폭매트릭스': 'amplification_matrix',
    '나노강화제': 'nano_boost',
    '복제': 'duplicate',
    '죽이는타이어': 'riptire',
    '지각충격': 'seismic_shock',
    '갈라내는칼날': 'cleaving_blade',
    '궤도광선': 'orbital_ray',
    '막시밀리앙': 'maximilian',
    '수면총': 'sleep_dart',
    '불사장치': 'immortality_field',
    '튕겨내기': 'deflect',
    '강철덫': 'steel_trap',
    '카두세우스지팡이': 'caduceus_staff',
    '카드세우스지팡이': 'caduceus_staff',
    '밥': 'bob',
    '비오비': 'bob',
    'b.o.b': 'bob',

    // probable hero_key / id values
    thorn_barrage: 'thorn_barrage',
    thornbarrage: 'thorn_barrage',
    blizzard: 'blizzard',
    earthshatter: 'earthshatter',
    gravity_flux: 'gravity_flux',
    gravityflux: 'gravity_flux',
    biotic_grenade: 'biotic_grenade',
    bioticgrenade: 'biotic_grenade',
    rescue: 'rescue',
    sound_barrier: 'sound_barrier',
    soundbarrier: 'sound_barrier',
    amplification_matrix: 'amplification_matrix',
    amplificationmatrix: 'amplification_matrix',
    nano_boost: 'nano_boost',
    nanoboost: 'nano_boost',
    bob: 'bob',
    duplicate: 'duplicate',
    riptire: 'riptire',
    rip_tire: 'riptire',
    seismic_shock: 'seismic_shock',
    seismicshock: 'seismic_shock',
    cleaving_blade: 'cleaving_blade',
    cleavingblade: 'cleaving_blade',
    orbital_ray: 'orbital_ray',
    orbitalray: 'orbital_ray',
    emp: 'emp',
    maximilian: 'maximilian',
    sleep_dart: 'sleep_dart',
    sleepdart: 'sleep_dart',
    immortality_field: 'immortality_field',
    immortalityfield: 'immortality_field',
    deflect: 'deflect',
    steel_trap: 'steel_trap',
    steeltrap: 'steel_trap',
    caduceus_staff: 'caduceus_staff',
    caduceusstaff: 'caduceus_staff',

    // spell_* forms from backend
    spell_thorn_volley: 'thorn_barrage',
    spell_thorn_barrage: 'thorn_barrage',
    spell_blizzard: 'blizzard',
    spell_earthshatter: 'earthshatter',
    spell_gravity_flux: 'gravity_flux',
    spell_biotic_grenade: 'biotic_grenade',
    spell_rescue: 'rescue',
    spell_sound_barrier: 'sound_barrier',
    spell_amp_matrix: 'amplification_matrix',
    spell_amplification_matrix: 'amplification_matrix',
    spell_nano_boost: 'nano_boost',
    spell_bob: 'bob',
    spell_duplicate: 'duplicate',
    spell_riptire: 'riptire',
    spell_seismic_slam: 'seismic_shock',
    spell_seismic_shock: 'seismic_shock',
    spell_dragonblade: 'cleaving_blade',
    spell_cleaving_blade: 'cleaving_blade',
    spell_orbital_ray: 'orbital_ray',
    spell_emp: 'emp',
    spell_maximilian: 'maximilian',
    spell_sleep_dart: 'sleep_dart',
    spell_immortality_field: 'immortality_field',
    spell_deflect: 'deflect',
    spell_steel_trap: 'steel_trap',
    spell_caduceus_staff: 'caduceus_staff',
};

function normalize(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '')
        .replace(/-/g, '_')
        .replace(/[.'"`~!@#$%^&*()+={}\[\]|\\/:;<>?,]/g, '');
}

function pickString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}


function buildNormalizedAliasMap(source: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
        out[normalize(key)] = value;
    }
    return out;
}

const HERO_NAME_ALIAS_NORMALIZED = buildNormalizedAliasMap(HERO_NAME_ALIAS);
const SPELL_ALIAS_NORMALIZED = buildNormalizedAliasMap(SPELL_ALIAS);
const KNOWN_HERO_KEYS = new Set<string>(Object.values(HERO_ID_ALIAS));
const KNOWN_SPELL_KEYS = new Set<string>(Object.values(SPELL_ALIAS));

export function resolveHeroKey(card: CardLike): string | null {
    const candidates = [
        pickString(card.hero_key),
        pickString(card.name),
        pickString(card.id),
    ].filter(Boolean) as string[];

    for (const raw of candidates) {
        const normalizedRaw = normalize(raw);
        const named = HERO_NAME_ALIAS[raw] ?? HERO_NAME_ALIAS_NORMALIZED[normalizedRaw] ?? raw;
        const normalized = normalize(named);
        if (!normalized) continue;

        // const aliased = HERO_ID_ALIAS[normalized] ?? normalized;
        // return aliased;
        const aliased = HERO_ID_ALIAS[normalized];
        if (aliased) return aliased;

        if (KNOWN_HERO_KEYS.has(normalized)) return normalized;
    }

    return null;
}

export function resolveSpellKey(card: CardLike): string | null {
    const candidates = [
        pickString(card.hero_key),
        pickString(card.name),
        pickString(card.id),
    ].filter(Boolean) as string[];

    for (const raw of candidates) {
        const direct = SPELL_ALIAS[raw];
        if (direct) return direct;

        const normalized = normalize(raw);
        if (!normalized) continue;

        const aliased = SPELL_ALIAS[normalized]
            ?? SPELL_ALIAS_NORMALIZED[normalized]
            ?? SPELL_ALIAS[raw.replace(/\s+/g, '')];
        if (aliased) return aliased;
    }

    return null;
}

export function getCardImageSrc(card: CardLike): string {
    if (!card) return '/heroes/_unknown.png';

    if (card.is_spell) {
        const spellKey = resolveSpellKey(card);
        return spellKey ? `/skills/${spellKey}.png` : '/skills/_unknown.png';
    }

    const heroKey = resolveHeroKey(card);
    return heroKey ? `/heroes/${heroKey}.png` : '/heroes/_unknown.png';
}

export function getCardBackImageSrc(): string {
    return '/cards/card_back.png';
}

function getCardArtRoleFolder(card: CardLike): string {
    if (card.is_spell) return 'spells';
    if (card.role === 'tank') return 'tanks';
    if (card.role === 'dealer') return 'dealers';
    if (card.role === 'healer') return 'healers';
    return 'dealers';
}

export function getCardArtCandidates(card: CardLike): string[] {
    if (!card) return [];
    const roleFolder = getCardArtRoleFolder(card);
    const key = card.is_spell ? resolveSpellKey(card) : resolveHeroKey(card);
    if (!key) return [];

    const normalizedKey = key === 'hana_song' ? 'songhana' : key;
    return [
        `/cards/${roleFolder}/${normalizedKey}.png`,
        `/cards/${roleFolder}/${normalizedKey}.jpg`,
        `/cards/${roleFolder}/${normalizedKey}.jpeg`,
    ];
}

export function getIllustrationCandidates(card: CardLike): string[] {
    if (!card) return [];
    const roleFolder = getCardArtRoleFolder(card);
    const key = card.is_spell ? resolveSpellKey(card) : resolveHeroKey(card);
    if (!key) return [];

    const normalizedKey = key === 'hana_song' ? 'songhana' : key;
    return [
        `/illustration/${roleFolder}/${normalizedKey}.png`,
        `/illustration/${roleFolder}/${normalizedKey}.jpg`,
        `/illustration/${roleFolder}/${normalizedKey}.jpeg`,
    ];
}

// 기존 코드 호환용
export function getHeroImageSrc(card: CardLike): string {
    return getCardImageSrc(card);
}

export function buildCoreImagePreloadList(): string[] {
    const heroImages = Array.from(KNOWN_HERO_KEYS).map((key) => `/heroes/${key}.png`);
    const spellImages = Array.from(KNOWN_SPELL_KEYS).map((key) => `/skills/${key}.png`);
    return Array.from(new Set<string>([
        ...heroImages,
        ...spellImages,
        '/heroes/_unknown.png',
        '/skills/_unknown.png',
        '/coin/front.png',
        '/coin/back.png',
    ]));
}

export async function preloadImageAssets(sources: string[], timeoutMs = 2500): Promise<void> {
    if (typeof window === 'undefined' || sources.length === 0) return;

    const loadPromises = Array.from(new Set(sources)).map((src) => new Promise<void>((resolve) => {
        const img = new Image();
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        img.onload = finish;
        img.onerror = finish;
        img.src = src;
    }));

    await Promise.race([
        Promise.allSettled(loadPromises).then(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
}