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
    sizePreset?: 'default' | 'opening';
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
    const isOpening = props.sizePreset === 'opening';
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

    const isHand = props.variant === 'hand';
    const costSize = isHand
        ? (isOpening ? '19.5%' : '24%')
        : 'calc(var(--field-card-width) * 0.22)';
    const portraitSize = isHand
        ? (isOpening ? '50%' : '47%')
        : 'calc(var(--field-card-width) * 0.45)';
    const nameFontSize = isHand
        ? (isOpening ? 'clamp(14px, 4.1vw, 20px)' : 'clamp(9px, 1.7vw, 12px)')
        : 'clamp(10px, calc(var(--field-card-width) * 0.145), 14px)';
    const hpFontSize = isHand
        ? (isOpening ? 'clamp(13px, 3.7vw, 18px)' : 'clamp(8px, 1.5vw, 10px)')
        : 'clamp(9px, calc(var(--field-card-width) * 0.13), 12px)';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: isHand
                    ? (isOpening ? '10px 10px 12px' : '4px 3px 5px')
                    : 'calc(var(--field-card-width) * 0.055) calc(var(--field-card-width) * 0.042)',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    width: costSize,
                    aspectRatio: '1 / 1',
                    borderRadius: '50%',
                    background: '#44aaff',
                    color: '#fff',
                    fontSize: isHand
                        ? (isOpening ? 'clamp(11px, 2.8vw, 15px)' : 'clamp(8px, 1.6vw, 11px)')
                        : 'clamp(9px, calc(var(--field-card-width) * 0.11), 12px)',
                    fontWeight: isHand ? 600 : 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isOpening ? '1.6px solid #0a0e1a' : '2px solid #0a0e1a',
                }}
            >
                {props.cost || 1}
            </div>

            <div
                style={{
                    width: portraitSize,
                    aspectRatio: '1 / 1',
                    borderRadius: isHand ? 10 : 'calc(var(--field-card-radius) + 1px)',
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
                    <span style={{ fontSize: isHand ? 'clamp(12px, 2vw, 16px)' : 'clamp(14px, calc(var(--field-card-width) * 0.22), 22px)', fontWeight: 700 }}>
                        {props.isSpell ? '✦' : ROLE_ICON[props.role as keyof typeof ROLE_ICON]}
                    </span>
                )}
            </div>

            <div
                style={{
                    fontSize: nameFontSize,
                    fontWeight: isHand ? 600 : 700,
                    color: '#e8ecf8',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    width: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {props.name}
            </div>

            {props.isSpell ? (
                <div style={{ fontSize: hpFontSize, color: '#ffaa22', fontWeight: isHand ? 600 : 700 }}>스킬</div>
            ) : (
                <div style={{ display: 'flex', gap: isHand ? (isOpening ? 4 : 2) : 'calc(var(--field-card-width) * 0.042)', fontSize: hpFontSize, fontWeight: isHand ? 600 : 700 }}>
                    <span style={{ color: '#22dd77' }}>♥{props.hp || 0}</span>
                </div>
            )}
        </div>
    );
};