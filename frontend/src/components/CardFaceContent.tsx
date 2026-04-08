import React from 'react';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';

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

    const nameColor = props.isSpell ? '#ffaa22' : (ROLE_COLOR[props.role as keyof typeof ROLE_COLOR] || '#e8ecf8');

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'calc(var(--field-card-width) * 0.055) calc(var(--field-card-width) * 0.042)',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    fontSize: 'clamp(10px, calc(var(--field-card-width) * 0.145), 14px)',
                    fontWeight: 700,
                    color: nameColor,
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
                    <span style={{ fontSize: 'clamp(14px, calc(var(--field-card-width) * 0.22), 22px)', fontWeight: 700 }}>
                        {props.isSpell ? '✦' : ROLE_ICON[props.role as keyof typeof ROLE_ICON]}
                    </span>
                )}
            </div>

            {props.isSpell ? (
                <div style={{ fontSize: 'clamp(9px, calc(var(--field-card-width) * 0.13), 12px)', color: '#ffaa22', fontWeight: 700 }}>스킬</div>
            ) : (
                <div style={{ display: 'flex', gap: 'calc(var(--field-card-width) * 0.042)', fontSize: 'clamp(9px, calc(var(--field-card-width) * 0.13), 12px)', fontWeight: 700 }}>
                    <span style={{ color: '#22dd77' }}>♥{props.hp || 0}</span>
                </div>
            )}
        </div>
    );
};