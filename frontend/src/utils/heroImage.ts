type HeroLike = {
    id?: string;
    hero_key?: string;
    name?: string;
    is_spell?: boolean;
};

const ID_ALIAS: Record<string, string> = {
    soldier76: 'soldier_76',
    soldier_76: 'soldier_76',
    junkerqueen: 'junker_queen',
    junker_queen: 'junker_queen',
    wreckingball: 'wrecking_ball',
    wrecking_ball: 'wrecking_ball',
    jetpackcat: 'jetpack_cat',
    jetpack_cat: 'jetpack_cat',
    reinhardt: 'reinhardt',
    winston: 'winston',
    zarya: 'zarya',
    dva: 'dva',
    doomfist: 'doomfist',
    sigma: 'sigma',
    roadhog: 'roadhog',
    ramattra: 'ramattra',
    bastion: 'bastion',
    tracer: 'tracer',
    venture: 'venture',
    sombra: 'sombra',
    symmetra: 'symmetra',
    widowmaker: 'widowmaker',
    hanzo: 'hanzo',
    echo: 'echo',
    ashe: 'ashe',
    cassidy: 'cassidy',
    reaper: 'reaper',
    mei: 'mei',
    torbjorn: 'torbjorn',
    sojourn: 'sojourn',
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
    domina: 'domina',
    mauga: 'mauga',
    hazard: 'hazard',
    orisa: 'orisa',
    junkrat: 'junkrat',
    genji: 'genji',
    venta: 'vendetta',
    vendetta: 'vendetta',
};

const NAME_ALIAS: Record<string, string> = {
    아나: 'ana',
    애쉬: 'ashe',
    바티스트: 'baptiste',
    바스티온: 'bastion',
    브리기테: 'brigitte',
    캐서디: 'cassidy',
    도미나: 'domina',
    둠피스트: 'doomfist',
    디바: 'dva',
    에코: 'echo',
    엠레: 'emre',
    프레야: 'freja',
    겐지: 'genji',
    한조: 'hanzo',
    해저드: 'hazard',
    일리아리: 'illari',
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

function normalize(value: string) {
    return value.toLowerCase().trim().replace(/\s+/g, '').replace(/-/g, '_');
}

export function getHeroImageSrc(card: HeroLike): string {
    if (card.is_spell) return '/heroes/_unknown.png';

    const rawCandidates = [card.id, card.hero_key, card.name].filter(Boolean) as string[];

    for (const raw of rawCandidates) {
        const byName = NAME_ALIAS[raw];
        const normalized = normalize(byName ?? raw);
        const aliased = ID_ALIAS[normalized] ?? normalized;
        return `/heroes/${aliased}.png`;
    }

    return '/heroes/_unknown.png';
}