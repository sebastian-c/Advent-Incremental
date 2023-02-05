import { isArray } from "@vue/shared";
import ClickableComponent from "features/clickables/Clickable.vue";
import type {
    CoercableComponent,
    GenericComponent,
    OptionsFunc,
    Replace,
    StyleValue
} from "features/feature";
import { Component, GatherProps, getUniqueID, jsx, setDefault, Visibility } from "features/feature";
import { DefaultValue, Persistent, persistent } from "game/persistence";
import {
    createVisibilityRequirement,
    displayRequirements,
    maxRequirementsMet,
    payRequirements,
    Requirements,
    requirementsMet
} from "game/requirements";
import type { DecimalSource } from "util/bignum";
import Decimal, { formatWhole } from "util/bignum";
import type {
    Computable,
    GetComputableType,
    GetComputableTypeWithDefault,
    ProcessedComputable
} from "util/computed";
import { processComputable } from "util/computed";
import { createLazyProxy } from "util/proxies";
import { coerceComponent, isCoercableComponent } from "util/vue";
import { computed, Ref, unref } from "vue";

export const BuyableType = Symbol("Buyable");

export type BuyableDisplay =
    | CoercableComponent
    | {
          title?: CoercableComponent;
          description?: CoercableComponent;
          effectDisplay?: CoercableComponent;
          showAmount?: boolean;
      };

export interface BuyableOptions {
    visibility?: Computable<Visibility>;
    requirements: Requirements;
    purchaseLimit?: Computable<DecimalSource>;
    initialValue?: DecimalSource;
    classes?: Computable<Record<string, boolean>>;
    style?: Computable<StyleValue>;
    mark?: Computable<boolean | string>;
    small?: Computable<boolean>;
    buyMax?: Computable<boolean>;
    display?: Computable<BuyableDisplay>;
    onPurchase?: VoidFunction;
}

export interface BaseBuyable {
    id: string;
    amount: Persistent<DecimalSource>;
    maxed: Ref<boolean>;
    canClick: ProcessedComputable<boolean>;
    onClick: VoidFunction;
    purchase: VoidFunction;
    type: typeof BuyableType;
    [Component]: GenericComponent;
    [GatherProps]: () => Record<string, unknown>;
}

export type Buyable<T extends BuyableOptions> = Replace<
    T & BaseBuyable,
    {
        visibility: GetComputableTypeWithDefault<T["visibility"], Visibility.Visible>;
        requirements: GetComputableType<T["requirements"]>;
        purchaseLimit: GetComputableTypeWithDefault<T["purchaseLimit"], Decimal>;
        classes: GetComputableType<T["classes"]>;
        style: GetComputableType<T["style"]>;
        mark: GetComputableType<T["mark"]>;
        small: GetComputableType<T["small"]>;
        buyMax: GetComputableType<T["buyMax"]>;
        display: Ref<CoercableComponent>;
    }
>;

export type GenericBuyable = Replace<
    Buyable<BuyableOptions>,
    {
        visibility: ProcessedComputable<Visibility>;
        purchaseLimit: ProcessedComputable<DecimalSource>;
    }
>;

export function createBuyable<T extends BuyableOptions>(
    optionsFunc: OptionsFunc<T, BaseBuyable, GenericBuyable>
): Buyable<T> {
    const amount = persistent<DecimalSource>(0);
    return createLazyProxy(() => {
        const buyable = optionsFunc();

        buyable.id = getUniqueID("buyable-");
        buyable.type = BuyableType;
        buyable[Component] = ClickableComponent as GenericComponent;

        buyable.amount = amount;
        buyable.amount[DefaultValue] = buyable.initialValue ?? 0;

        const limitRequirement = {
            requirementMet: computed(() =>
                Decimal.sub(
                    unref((buyable as GenericBuyable).purchaseLimit),
                    (buyable as GenericBuyable).amount.value
                )
            ),
            requiresPay: false,
            visibility: Visibility.None
        } as const;
        const visibilityRequirement = createVisibilityRequirement(buyable as GenericBuyable);
        if (isArray(buyable.requirements)) {
            buyable.requirements.unshift(visibilityRequirement);
            buyable.requirements.push(limitRequirement);
        } else {
            buyable.requirements = [visibilityRequirement, buyable.requirements, limitRequirement];
        }

        buyable.maxed = computed(() =>
            Decimal.gte(
                (buyable as GenericBuyable).amount.value,
                unref((buyable as GenericBuyable).purchaseLimit)
            )
        );
        processComputable(buyable as T, "classes");
        const classes = buyable.classes as ProcessedComputable<Record<string, boolean>> | undefined;
        buyable.classes = computed(() => {
            const currClasses = unref(classes) || {};
            if ((buyable as GenericBuyable).maxed.value) {
                currClasses.bought = true;
            }
            return currClasses;
        });
        buyable.canClick = computed(() => requirementsMet(buyable.requirements));
        buyable.onClick = buyable.purchase =
            buyable.onClick ??
            buyable.purchase ??
            function (this: GenericBuyable) {
                const genericBuyable = buyable as GenericBuyable;
                if (!unref(genericBuyable.canClick)) {
                    return;
                }
                payRequirements(
                    buyable.requirements,
                    unref(genericBuyable.buyMax)
                        ? maxRequirementsMet(genericBuyable.requirements)
                        : 1
                );
                genericBuyable.amount.value = Decimal.add(genericBuyable.amount.value, 1);
                genericBuyable.onPurchase?.();
            };
        processComputable(buyable as T, "display");
        const display = buyable.display;
        buyable.display = jsx(() => {
            // TODO once processComputable types correctly, remove this "as X"
            const currDisplay = unref(display) as BuyableDisplay;
            if (isCoercableComponent(currDisplay)) {
                const CurrDisplay = coerceComponent(currDisplay);
                return <CurrDisplay />;
            }
            if (currDisplay != null) {
                const genericBuyable = buyable as GenericBuyable;
                const Title = coerceComponent(currDisplay.title ?? "", "h3");
                const Description = coerceComponent(currDisplay.description ?? "");
                const EffectDisplay = coerceComponent(currDisplay.effectDisplay ?? "");

                return (
                    <span>
                        {currDisplay.title == null ? null : (
                            <div>
                                <Title />
                            </div>
                        )}
                        {currDisplay.description == null ? null : <Description />}
                        {currDisplay.showAmount === false ? null : (
                            <div>
                                <br />
                                {unref(genericBuyable.purchaseLimit) === Decimal.dInf ? (
                                    <>Amount: {formatWhole(genericBuyable.amount.value)}</>
                                ) : (
                                    <>
                                        Amount: {formatWhole(genericBuyable.amount.value)} /{" "}
                                        {formatWhole(unref(genericBuyable.purchaseLimit))}
                                    </>
                                )}
                            </div>
                        )}
                        {currDisplay.effectDisplay == null ? null : (
                            <div>
                                <br />
                                Currently: <EffectDisplay />
                            </div>
                        )}
                        {genericBuyable.maxed.value ? null : (
                            <div>
                                <br />
                                {displayRequirements(
                                    genericBuyable.requirements,
                                    unref(genericBuyable.buyMax)
                                        ? maxRequirementsMet(genericBuyable.requirements)
                                        : 1
                                )}
                            </div>
                        )}
                    </span>
                );
            }
            return "";
        });

        processComputable(buyable as T, "visibility");
        setDefault(buyable, "visibility", Visibility.Visible);
        processComputable(buyable as T, "purchaseLimit");
        setDefault(buyable, "purchaseLimit", Decimal.dInf);
        processComputable(buyable as T, "style");
        processComputable(buyable as T, "mark");
        processComputable(buyable as T, "small");
        processComputable(buyable as T, "buyMax");

        buyable[GatherProps] = function (this: GenericBuyable) {
            const { display, visibility, style, classes, onClick, canClick, small, mark, id } =
                this;
            return {
                display,
                visibility,
                style: unref(style),
                classes,
                onClick,
                canClick,
                small,
                mark,
                id
            };
        };

        return buyable as unknown as Buyable<T>;
    });
}
