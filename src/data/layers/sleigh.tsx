/**
 * @module
 * @hidden
 */
import HotkeyVue from "components/Hotkey.vue";
import Spacer from "components/layout/Spacer.vue";
import Modal from "components/Modal.vue";
import { createCollapsibleMilestones, createCollapsibleModifierSections } from "data/common";
import { main } from "data/projEntry";
import { createBar } from "features/bars/bar";
import { createClickable } from "features/clickables/clickable";
import {
    addHardcap,
    addSoftcap,
    createIndependentConversion,
    createPolynomialScaling
} from "features/conversion";
import { jsx, showIf } from "features/feature";
import { createHotkey } from "features/hotkey";
import { createMilestone } from "features/milestones/milestone";
import { createResource, displayResource } from "features/resources/resource";
import { BaseLayer, createLayer } from "game/layers";
import {
    createAdditiveModifier,
    createExponentialModifier,
    createMultiplicativeModifier,
    createSequentialModifier,
    Modifier
} from "game/modifiers";
import { noPersist, persistent } from "game/persistence";
import Decimal, { DecimalSource, format, formatTime, formatWhole } from "util/bignum";
import { Direction, WithRequired } from "util/common";
import { render } from "util/vue";
import { computed, ref, unref, watchEffect } from "vue";
import elves from "./elves";
import factory from "./factory";
import management from "./management";
import toys from "./toys";
import trees from "./trees";
import wrappingPaper from "./wrapping-paper";
import metal from "./metal";
import plastic from "./plastic"
import { createBuyable, GenericBuyable } from "features/buyable";
import { Resource } from "features/resources/resource";
import { isArray } from "@vue/shared";


const id = "sleigh";
const day = 22;
const layer = createLayer(id, function (this: BaseLayer) {
    const name = "Sleigh";
    const color = "#D66B02";
    const colorDark = "#D66B02";
    const maxProgress = 100
    function displayCost(
        res: Resource<DecimalSource> | Resource<DecimalSource>[],
        cost: DecimalSource,
        label: string
    ) {
        const affordable = (isArray(res) ? res : [res]).every(res => Decimal.gte(res.value, cost));
        return (
            <span class={affordable ? "" : "unaffordable"}>
                {format(cost)} {label}
            </span>
        );
    }
    const sleighProgress = computed(() => sleigh.amount)
    const sleighCost = computed(() => {
        let v = sleighProgress.value.value;
        return {
            wood: Decimal.mul(1e100, Decimal.pow(1.2, v)),
            metal: Decimal.mul(1e60, Decimal.pow(1.1, v)),
            plastic: Decimal.mul(1e20, Decimal.pow(1.05, v))
        };
    });
    const sleigh = createBuyable(() => ({
        display: jsx(() => (
            <>
                <h3>Fix the sleigh</h3>
                <div>
                    Increase sleigh fixed by 1%
                </div>
                <div>
                    Costs {displayCost(trees.logs, sleighCost.value.wood, "logs")},
                    {displayCost(metal.metal, sleighCost.value.metal, "metal")},
                    {displayCost(plastic.plastic, sleighCost.value.plastic, "plastic")}
                </div>
            </>
        )),
        canPurchase(): boolean {
            return (
                sleighCost.value.wood.lte(trees.logs.value) &&
                sleighCost.value.metal.lte(metal.metal.value) &&
                sleighCost.value.plastic.lte(plastic.plastic.value)
            );
        },
        onPurchase() {
            this.amount.value = Decimal.add(this.amount.value, 1);
        },
        visibility: () => showIf(Decimal.lt(sleighProgress.value.value, 100)),
        style: "width: 600px"
    })) as GenericBuyable;

    const shouldShowPopups = computed(() => true);
    const milestone1 = createMilestone(() => ({
        display: {
            requirement: "1% Sleigh Fixed",
            effectDisplay: "Ore gives 5% more metal for each % of sleigh fixed"
        },
        shouldEarn: () => Decimal.gte(sleighProgress.value.value, 1),
        showPopups: shouldShowPopups
    }));
    const milestones = {
        milestone1
    };
    const { collapseMilestones, display: milestonesDisplay } =
        createCollapsibleMilestones(milestones);

    const dayProgress = createBar(() => ({
        direction: Direction.Right,
        width: 600,
        height: 25,
        fillStyle: `backgroundColor: ${colorDark}`,
        progress: () =>
            main.day.value === day || main.currentlyMastering.value?.name === name
                ? Decimal.div(sleighProgress.value.value, 100)
                : 1,
        display: jsx(() =>
            main.day.value === day || main.currentlyMastering.value?.name === name ? (
                <>{formatWhole(sleighProgress.value.value)}%</>
            ) : (
                ""
            )
        )
    }));

    /*const [generalTab, generalTabCollapsed] = createCollapsibleModifierSections(() => [
        {
            title: "Max Foundation",
            modifier: maxFoundation,
            base: 100
        }
    ]);
    const showModifiersModal = ref(false);
    const modifiersModal = jsx(() => (
        <Modal
            modelValue={showModifiersModal.value}
            onUpdate:modelValue={(value: boolean) => (showModifiersModal.value = value)}
            v-slots={{
                header: () => <h2>{name} Modifiers</h2>,
                body: generalTab
            }}
        />
    ));*/

    watchEffect(() => {
        if (main.day.value === day && Decimal.gte(sleighProgress.value.value, 100)) {
            main.completeDay();
        } 
    });

    return {
        name,
        day,
        color,
        sleighProgress,
        milestones,
        collapseMilestones,
        minWidth: 700,
        sleigh,
        display: jsx(() => (
            <>
                <div>
                    {main.day.value === day
                        ? `Complete the sleigh to complete the day`
                        : `${name} Complete!`}
                </div>
                {render(dayProgress)}
                <Spacer />
                <div>
                    <span>The sleigh is </span>
                    <h2 style={`color: ${color}; text-shadow: 0 0 10px ${color}`}>
                        {formatWhole(sleighProgress.value.value)}
                    </h2>
                    % fixed
                </div>
                {Decimal.lt(sleighProgress.value.value, 100) ||
                management.elfTraining.expandersElfTraining.milestones[2].earned.value ? (
                    <Spacer />
                ) : null}
                {render(sleigh)}
                <Spacer />
                {milestonesDisplay()}
            </>
        )),
        minimizedDisplay: jsx(() => (
            <div>
                {name}{" "}
                <span class="desc">
                    {formatWhole(sleighProgress.value.value)}% sleigh
                </span>
            </div>
        )),
    };
});

export default layer;
