type Src<T> = T | (() => T);
const SrcVal = <T>(s: Src<T>): T => (typeof s === "function" ? (s as () => T)() : s);

type NumKey<O>  = { [P in keyof O]: O[P] extends number ? P : never }[keyof O];
type FlagKey<O> = { [P in keyof O]: O[P] extends number | boolean ? P : never }[keyof O];
type VecKey<O>  = { [P in keyof O]: O[P] extends ArrayLike<number> ? P : never }[keyof O];
type StringKey<O> = { [P in keyof O]: O[P] extends string ? P : never }[keyof O];
type EnumOption = { value: number; name: string };

/** What every inspector field needs to talk to its bound value. */
type FieldIO<T> = {
    /** Bound value getter. */
    get: () => T;
    /** Bound value setter. */
    set: (v: T) => void;
    /** Default for double-click reset, resolved for the current target object. */
    def: () => T;
    /** Returns a forced value while the field is locked, undefined when editable. */
    frozen?: () => T | undefined;
    /** Callback triggered by the setter. */
    onChange?: (v: T) => void;
    /** Returns true if the field should be visible. */
    visible?: () => boolean;
    /** Field tooltip. */
    tooltip?: string;
};

interface IUI_FIELD<T> {
    /** localStorage key used to save the fields value. */
    pid: string;
    /** Should the inspector section track whether this field has been modified. */
    track: boolean;
    /** Field label. */
    readonly label: string;
    /** True if the field value differs from the default one. */
    readonly modified: boolean;
    /** True if the field is frozen. */
    readonly is_frozen: boolean;

    /** Updates visibility, modification status and the displayed value. */
    refresh(): void;
    /** Updates the displayed value with the one from the bound object. If the field is frozen, set the displayed value to the forced one. */
    refresh_value(): void;
    /** Updates the value in the bound object, triggers onChange() and calls refresh_value(). */
    apply(v: T): void;

    /** Sets the visibility of the field. */
    set_visible(visible: boolean): void;
    /** Toggles the visibility of the field. */
    toggle_visibility(): void;
    /** Store into localStorage the field state. */
    save_now(): void;
    /** Restore previously stored field state. */
    restore(): void;
    /** Reset field state and bound value to the default one. */
    reset(): void;
}

type Common<O, T> = {
    label: string;
    obj: Src<O>;
    frozen?: () => T | undefined;
    visible?: () => boolean;
    tooltip?:string;
    persist?: boolean;
    track?: boolean;
};

type SliderDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K; min: Src<number>; max: Src<number>;
    step?: number; log?: boolean; int?: boolean; onChange?: (v: number) => void;
};

type ToggleDef<O, K extends FlagKey<O>> = Common<O, number | boolean> & {
    key: K; int?: boolean; onChange?: (v: number | boolean) => void;
};

type VecDef<O, K extends VecKey<O>> = Common<O, number[]> & {
    key: K; min?: number; max?: number; step?: number; labels?: string; onChange?: (v: number[]) => void;
};

type EnumDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K; options: Src<EnumOption[]>; onChange?: (v: number) => void;
};

type ColorDef<O, K extends VecKey<O>> = Common<O, number[]> & {
    key: K;
    /** fires when the user picks or types a color. */
    onPick?: (v: number[]) => void;
};

type FloatDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K; min?: number; max?: number; step?: number; int?: boolean; decimals?: number;
    onChange?: (v: number) => void;
};

type GlslEntry = { label: string; src: string };

type GlslDef<O, K extends StringKey<O>> = Common<O, string> & {
    key: K; onChange?: (v:string) => void;

    title: () => string;
    set_title: (t:string) => void;
    button: string;
    required_fn?: string;
    line_offset: number;
    compile: (src:string, restoring?:boolean) => string|null;
    library?: { defaults: () => GlslEntry[]; storage_key: string };
    persist?: boolean;
};

type PaletteDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K;
    colors: () => color_data[];
    onAdd?: (c: color_data) => void;
    onChange?: (v: number) => void;
};