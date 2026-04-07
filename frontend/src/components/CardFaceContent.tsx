import React from 'react';
import { ROLE_ICON } from '../types/constants';

type Role = 'tank' | 'dealer' | 'healer' | string | null | undefined;

interface BaseProps {
    variant: 'hand' | 'field';
    name: string;
    role?: Role;
    isSpell?: boolean;
    currentImageSrc: string;
    usingFullCardArt: boolean;
    imgError: boolean;
    onError: () => void;
}

interface HandProps extends BaseProps {
    variant: 'hand';
    cost?: number;
    hp?: number;
}

interface FieldProps extends BaseProps {
    variant: 'field';
}

type Props = HandProps | FieldProps;

export const CardFaceContent: React.FC<Props> = (props) => {
    const handRootRef = React.useRef<HTMLDivElement | null>(null);
    const [handScale, setHandScale] = React.useState(1);

    React.useEffect(() => {
        if (props.variant !== 'hand') return;
        const node = handRootRef.current;
        if (!node) return;
        const updateScale = () => {
            const width = node.clientWidth || 70;
            const next = Math.min(2.4, Math.max(0.9, width / 70));
            setHandScale(next);
        };
        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(node);
        return () => observer.disconnect();
    }, [props.variant]);

    if (props.usingFullCardArt) {
        return (
            <img
                src={props.currentImageSrc}
                alt={props.name}
                onError={props.onError}
                style={props.variant === 'hand'
                    ? {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        boxSizing: 'border-box',
                        imageRendering: 'auto',
                        backfaceVisibility: 'hidden',
                        transform: 'translateZ(0)',
                    }
                    : {
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 'calc(var(--field-card-radius) - 1px)',
                        imageRendering: 'auto',
                        backfaceVisibility: 'hidden',
                    }}
            />
        );
    }

    if (props.variant === 'field') {
        return (
            <div
                style={{
                    width: 'calc(var(--field-card-width) * 0.45)',
                    height: 'calc(var(--field-card-width) * 0.45)',
                    borderRadius: 'calc(var(--field-card-radius) + 1px)',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    background: '#1a223a',
                    border: '1px solid #2a3560',
                }}
            >
                {!props.imgError ? (
                    <img
                        src={props.currentImageSrc}
                        alt={props.name}
                        onError={props.onError}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            imageRendering: 'auto',
                            backfaceVisibility: 'hidden',
                            transform: 'translateZ(0)',
                        }}
                    />
                ) : (
                    <span style={{ fontSize: 16 }}>{ROLE_ICON[props.role as keyof typeof ROLE_ICON]}</span>
                )}
            </div>
        );
    }

    return (
        <div
            ref={handRootRef}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <div
                style={{
                    width: `${Math.round(18 * handScale)}px`,
                    height: `${Math.round(18 * handScale)}px`,
                    borderRadius: '50%',
                    background: '#44aaff',
                    color: '#fff',
                    fontSize: `${Math.round(9 * handScale)}px`,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #0a0e1a',
                }}
            >
                {props.cost || 1}
            </div>

            <div
                style={{
                    width: `${Math.round(40 * handScale)}px`,
                    height: `${Math.round(40 * handScale)}px`,
                    borderRadius: `${Math.round(8 * handScale)}px`,
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    background: '#1a223a',
                    border: '1px solid #2a3560',
                }}
            >
                {!props.imgError && props.currentImageSrc ? (
                    <img
                        src={props.currentImageSrc}
                        alt={props.name}
                        onError={props.onError}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            imageRendering: 'auto',
                            backfaceVisibility: 'hidden',
                            transform: 'translateZ(0)',
                        }}
                    />
                ) : (
                    <span style={{ fontSize: `${Math.round(18 * handScale)}px` }}>
                        {props.isSpell ? '✦' : ROLE_ICON[props.role as keyof typeof ROLE_ICON]}
                    </span>
                )}
            </div>

            <div
                style={{
                    fontSize: `${Math.round(9 * handScale)}px`,
                    fontWeight: 600,
                    color: '#e8ecf8',
                    textAlign: 'center',
                    lineHeight: 1.1,
                }}
            >
                {props.name}
            </div>

            {props.isSpell ? (
                <div style={{ fontSize: `${Math.round(8 * handScale)}px`, color: '#ffaa22', fontWeight: 600 }}>스킬</div>
            ) : (
                <div style={{ display: 'flex', gap: 3, fontSize: `${Math.round(8 * handScale)}px`, fontWeight: 600 }}>
                    <span style={{ color: '#22dd77' }}>♥{props.hp || 0}</span>
                </div>
            )}
        </div>
    );
};