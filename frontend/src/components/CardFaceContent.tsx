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
                        imageRendering: 'auto',
                        backfaceVisibility: 'hidden',
                        transform: 'translateZ(0)',
                    }
                    : {
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
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
        <>
            <div
                style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#44aaff',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 900,
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
                    width: 34,
                    height: 34,
                    borderRadius: 8,
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
                    <span style={{ fontSize: 18 }}>
                        {props.isSpell ? '✦' : ROLE_ICON[props.role as keyof typeof ROLE_ICON]}
                    </span>
                )}
            </div>

            <div
                style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#e8ecf8',
                    textAlign: 'center',
                    lineHeight: 1.1,
                }}
            >
                {props.name}
            </div>

            {props.isSpell ? (
                <div style={{ fontSize: 8, color: '#ffaa22', fontWeight: 700 }}>스킬</div>
            ) : (
                <div style={{ display: 'flex', gap: 3, fontSize: 8, fontWeight: 700 }}>
                    <span style={{ color: '#22dd77' }}>♥{props.hp || 0}</span>
                </div>
            )}
        </>
    );
};