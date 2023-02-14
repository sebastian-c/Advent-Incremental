/**
 * @module
 * @hidden
 */
import Column from "components/layout/Column.vue";
import Row from "components/layout/Row.vue";
import Spacer from "components/layout/Spacer.vue";
import Modal from "components/Modal.vue";
import {
    changeActiveBuyables,
    createCollapsibleModifierSections,
    setUpDailyProgressTracker
} from "data/common";
import { main } from "data/projEntry";
import { createRepeatable, GenericRepeatable } from "features/repeatable";
import { jsx, showIf } from "features/feature";
import MainDisplay from "features/resources/MainDisplay.vue";
import { createResource, Resource } from "features/resources/resource";
import { createUpgrade, GenericUpgrade } from "features/upgrades/upgrade";
import { globalBus } from "game/events";
import { BaseLayer, createLayer } from "game/layers";
import {
    createAdditiveModifier,
    createMultiplicativeModifier,
    createSequentialModifier
} from "game/modifiers";
import { noPersist, persistent } from "game/persistence";
import Decimal, { DecimalSource, format, formatWhole } from "util/bignum";
import { render, renderCol, renderRow } from "util/vue";
import { computed, ComputedRef, ref, unref } from "vue";
import boxes, { BoxesBuyable } from "./boxes";
import dyes from "./dyes";
import elves from "./elves";
import management from "./management";
import metal from "./metal";
import oil from "./oil";
import paper from "./paper";
import workshop from "./workshop";
import toys from "./toys";
import reindeer from "./reindeer";
import sleigh from "./sleigh";
import factory from "./factory";
import routing from "./routing";
import { createCostRequirement } from "game/requirements";

const id = "plastic";
const day = 10;
const layer = createLayer(id, function (this: BaseLayer) {
    const name = "Plastic";
    const color = "#DCD9CD";

    const plastic = createResource<DecimalSource>(0, "plastic");

    const [generalTab, generalTabCollapsed] = createCollapsibleModifierSections(() => [
        {
            title: "Plastic Gain",
            modifier: plasticGain,
            base: 0
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
    ));

    const activeRefinery = persistent<DecimalSource>(0);
    const oilCost = computed(() =>
        management.elfTraining.plasticElfTraining.milestones[2].earned.value
            ? 0
            : Decimal.times(activeRefinery.value, 100).times(
                  management.elfTraining.oilElfTraining.milestones[3].earned.value ? 5 : 1
              )
    ) as ComputedRef<DecimalSource>;
    const refineryCost = computed(() => {
        const v = new Decimal(buildRefinery.amount.value);
        let cost = Decimal.pow(1.2, v).times(1e7);
        if (management.elfTraining.fertilizerElfTraining.milestones[3].earned.value) {
            cost = Decimal.sub(cost, Decimal.pow(plastic.value, 2)).max(0);
        }
        return cost;
    });
    const buildRefinery = createRepeatable(() => ({
        requirements: createCostRequirement(() => ({
            resource: metal.metal,
            cost: refineryCost
        })),
        resource: metal.metal,
        display: {
            title: "Refinery",
            description: jsx(() => (
                <div>
                    Refines oil into plastic pellets
                    <br />
                    Consumes 100 oil/s to create 1 plastic/s
                </div>
            )),
            effectDisplay: jsx(() => (
                <>
                    <br />-{format(oilCost.value)} oil/sec
                    <br />+{format(activeRefinery.value)} plastic/sec
                </>
            )),
            showAmount: false
        },
        onPurchase() {
            activeRefinery.value = Decimal.add(activeRefinery.value, 1);
        },
        style: {
            width: "300px"
        },
        visibility: () => showIf(!main.isMastery.value || masteryEffectActive.value)
    })) as GenericRepeatable & { resource: Resource };
    const {
        min: minRefinery,
        max: maxRefinery,
        add: addRefinery,
        remove: removeRefinery
    } = changeActiveBuyables({
        buyable: buildRefinery,
        active: activeRefinery,
        style: { minHeight: "20px", width: "40px", color: "var(--feature-foreground)" }
    });

    const upgradeCost = computed(() =>
        Decimal.pow(
            masteryEffectActive.value ? 4 : 5,
            Decimal.add(
                [...Object.values(upgrades), ...Object.values(elfUpgrades)].filter(
                    upg => upg.bought.value
                ).length,
                2
            )
        )
    );
    const paperTools = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        display: () => ({
            title: "Plastic Scissors",
            description: "Unlock paper upgrades",
            showCost: !paperTools.bought.value
        })
    })) as GenericUpgrade;
    const boxTools = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        display: () => ({
            title: "Plastic Level",
            description: "Unlock box upgrades",
            showCost: !boxTools.bought.value
        })
    })) as GenericUpgrade;
    const clothTools = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        display: () => ({
            title: "Plastic Cane",
            description: "Unlock cloth upgrades",
            showCost: !clothTools.bought.value
        })
    })) as GenericUpgrade;
    const upgrades = { paperTools, boxTools, clothTools };

    const paperElf = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        visibility: () => showIf(paperTools.bought.value),
        display: () => ({
            title: "Paper Elf Recruitment",
            description: "Double plastic gain and unlock a new elf for training",
            showCost: !paperElf.bought.value
        }),
        onPurchase() {
            if (masteryEffectActive.value) {
                elves.elves.paperElf.bought.value = true;
            }
        }
    })) as GenericUpgrade;
    const boxElf = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        visibility: () => showIf(boxTools.bought.value),
        display: () => ({
            title: "Box Elf Recruitment",
            description: "Double plastic gain and unlock a new elf for training",
            showCost: !boxElf.bought.value
        }),
        onPurchase() {
            if (masteryEffectActive.value) {
                elves.elves.boxElf.bought.value = true;
            }
        }
    })) as GenericUpgrade;
    const clothElf = createUpgrade(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost: upgradeCost
        })),
        visibility: () => showIf(clothTools.bought.value),
        display: () => ({
            title: "Cloth Elf Recruitment",
            description: "Double plastic gain and unlock a new elf for training",
            showCost: !clothElf.bought.value
        }),
        onPurchase() {
            if (masteryEffectActive.value) {
                elves.elves.clothElf.bought.value = true;
            }
        }
    })) as GenericUpgrade;
    const elfUpgrades = { paperElf, boxElf, clothElf };

    const passivePaper = createRepeatable(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost() {
                let v = passivePaper.amount.value;
                v = Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value).times(v);
                return Decimal.pow(1.3, v).times(100).div(dyes.boosts.blue2.value);
            }
        })),
        resource: noPersist(plastic),
        inverseCost(x: DecimalSource) {
            let v = Decimal.times(x, dyes.boosts.blue2.value).div(100).log(1.3);
            v = v.div(Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value));
            return Decimal.isNaN(v) ? Decimal.dZero : v.floor().max(0);
        },
        visibility: () => showIf(paperElf.bought.value),
        display: {
            title: "Plastic Printing Press",
            description: "Gain +1% of your paper gain per second",
            effectDisplay: jsx(() => <>{formatWhole(passivePaper.totalAmount.value)}%</>),
            showAmount: false
        },
        freeLevels: computed(() => {
            let levels: DecimalSource = 0;
            if (management.elfTraining.plasticElfTraining.milestones[1].earned.value) {
                levels = Decimal.max(passiveBoxes.amount.value, 1)
                    .sqrt()
                    .floor()
                    .add(Decimal.max(clothGains.amount.value, 1).sqrt().floor());
            }
            return levels;
        }),
        totalAmount: computed(() =>
            Decimal.add(passivePaper.amount.value, passivePaper.freeLevels.value)
        )
    })) as BoxesBuyable;
    const passiveBoxes = createRepeatable(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost() {
                let v = passiveBoxes.amount.value;
                v = Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value).times(v);
                return Decimal.pow(1.3, v).times(100).div(dyes.boosts.blue2.value);
            }
        })),
        resource: noPersist(plastic),
        inverseCost(x: DecimalSource) {
            let v = Decimal.times(x, dyes.boosts.blue2.value).div(100).log(1.3);
            v = v.div(Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value));
            return Decimal.isNaN(v) ? Decimal.dZero : v.floor().max(0);
        },
        visibility: () => showIf(boxElf.bought.value),
        display: {
            title: "Plastic Box Folder",
            description: "Gain +1% of your box gain per second",
            effectDisplay: jsx(() => <>{formatWhole(passiveBoxes.totalAmount.value)}%</>),
            showAmount: false
        },
        freeLevels: computed(() => {
            let levels: DecimalSource = 0;
            if (management.elfTraining.plasticElfTraining.milestones[1].earned.value) {
                levels = Decimal.max(passivePaper.amount.value, 1)
                    .sqrt()
                    .floor()
                    .add(Decimal.max(clothGains.amount.value, 1).sqrt().floor());
            }
            return levels;
        }),
        totalAmount: computed(() =>
            Decimal.add(passiveBoxes.amount.value, passiveBoxes.freeLevels.value)
        )
    })) as BoxesBuyable;
    const clothGains = createRepeatable(() => ({
        requirements: createCostRequirement(() => ({
            resource: noPersist(plastic),
            cost() {
                let v = clothGains.amount.value;
                v = Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value).times(v);
                return Decimal.pow(1.3, v).times(100).div(dyes.boosts.blue2.value);
            }
        })),
        resource: noPersist(plastic),
        inverseCost(x: DecimalSource) {
            let v = Decimal.times(x, dyes.boosts.blue2.value).div(100).log(1.3);
            v = v.div(Decimal.pow(0.95, paper.books.plasticBook.totalAmount.value));
            return Decimal.isNaN(v) ? Decimal.dZero : v.floor().max(0);
        },
        visibility: () => showIf(clothElf.bought.value),
        display: {
            title: "Plastic Shepherd",
            description: "All cloth actions are +10% more efficient",
            effectDisplay: jsx(() => (
                <>{formatWhole(Decimal.times(clothGains.totalAmount.value, 10))}%</>
            )),
            showAmount: false
        },
        freeLevels: computed(() => {
            let levels: DecimalSource = 0;
            if (management.elfTraining.plasticElfTraining.milestones[1].earned.value) {
                levels = Decimal.max(passivePaper.amount.value, 1)
                    .sqrt()
                    .floor()
                    .add(Decimal.max(passiveBoxes.amount.value, 1).sqrt().floor());
            }
            return levels;
        }),
        totalAmount: computed(() =>
            Decimal.add(clothGains.amount.value, clothGains.freeLevels.value)
        )
    })) as BoxesBuyable;
    const buyables = { passivePaper, passiveBoxes, clothGains };

    const plasticGain = createSequentialModifier(() => [
        createAdditiveModifier(() => ({
            addend: () =>
                management.elfTraining.oilElfTraining.milestones[3].earned.value
                    ? Decimal.times(activeRefinery.value, 5)
                    : activeRefinery.value,
            description: "Oil Refinery",
            enabled: () => Decimal.gt(activeRefinery.value, 0)
        })),
        createAdditiveModifier(() => ({
            addend: () =>
                management.elfTraining.oilElfTraining.milestones[3].earned.value
                    ? Decimal.times(Decimal.div(sleigh.sleighProgress.value.value, 2).floor(), 200)
                    : Decimal.times(activeRefinery.value, 40),
            description: "75% Sleigh Fixed",
            enabled: sleigh.milestones.milestone7.earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Paper Elf Recruitment",
            enabled: paperElf.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Box Elf Recruitment",
            enabled: boxElf.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Cloth Elf Recruitment",
            enabled: clothElf.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Carry plastic in boxes",
            enabled: boxes.row2Upgrades.plasticUpgrade.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => oil.oilEffectiveness.value,
            description: "Effectiveness",
            enabled: () => Decimal.lt(oil.oilEffectiveness.value, 1)
        })),
        createMultiplicativeModifier(() => ({
            multiplier: dyes.boosts.yellow1,
            description: "Yellow Dye Boost 1",
            enabled: () => Decimal.gte(dyes.dyes.yellow.amount.value, 1)
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () =>
                Decimal.div(workshop.foundationProgress.value, 10).floor().div(10).add(1),
            description: "800% Foundation Completed",
            enabled: workshop.milestones.extraExpansionMilestone4.earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.add(oil.buildExtractor.amount.value, 1).pow(1.25),
            description: "Snowball Level 4",
            enabled: management.elfTraining.kilnElfTraining.milestones[3].earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.add(dyes.secondaryDyeSum.value, 1).cbrt(),
            description: "Colorful Plastic",
            enabled: oil.row3Upgrades[2].bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Tinsel Level 1",
            enabled: management.elfTraining.plasticElfTraining.milestones[0].earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.div(buildRefinery.amount.value, 100).add(1),
            description: "Tinsel Level 4",
            enabled: management.elfTraining.plasticElfTraining.milestones[3].earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 50,
            description: "350 toys",
            enabled: toys.milestones.milestone4.earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => dyes.boosts.white1.value,
            description: "White Dye Boost",
            enabled: () => Decimal.gt(dyes.dyes.white.amount.value, 0)
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () =>
                Decimal.div(sleigh.sleighProgress.value.value, 5).floor().mul(0.05).add(1),
            description: "20% Sleigh Fixed",
            enabled: sleigh.milestones.milestone3.earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 4,
            description: "40% Sleigh Fixed",
            enabled: sleigh.milestones.milestone5.earned
        })),
        reindeer.reindeer.blitzen.modifier,
        createMultiplicativeModifier(() => ({
            multiplier: () =>
                Object.values(factory.components).reduce(
                    (x, y) => y + (x.type == "plastic" ? 1 : 0),
                    1
                ) as number,
            description: "300,000 Cities Solved",
            enabled: routing.metaMilestones[4].earned
        }))
    ]);
    const computedPlasticGain = computed(() => plasticGain.apply(0));

    globalBus.on("update", diff => {
        if (Decimal.lt(main.day.value, day)) {
            return;
        }

        plastic.value = Decimal.times(diff, computedPlasticGain.value).add(plastic.value);
    });

    const { total: totalPlastic, trackerDisplay } = setUpDailyProgressTracker({
        resource: plastic,
        goal: 2.5e5,
        name,
        day,
        background: color,
        textColor: "var(--feature-foreground)",
        modal: {
            show: showModifiersModal,
            display: modifiersModal
        }
    });

    const mastery = {
        plastic: persistent<DecimalSource>(0),
        totalPlastic: persistent<DecimalSource>(0),
        activeRefinery: persistent<DecimalSource>(0),
        buildRefinery: { amount: persistent<DecimalSource>(0) },
        upgrades: {
            paperTools: { bought: persistent<boolean>(false) },
            boxTools: { bought: persistent<boolean>(false) },
            clothTools: { bought: persistent<boolean>(false) }
        },
        elfUpgrades: {
            paperElf: { bought: persistent<boolean>(false) },
            boxElf: { bought: persistent<boolean>(false) },
            clothElf: { bought: persistent<boolean>(false) }
        },
        buyables: {
            passivePaper: { amount: persistent<DecimalSource>(0) },
            passiveBoxes: { amount: persistent<DecimalSource>(0) },
            clothGains: { amount: persistent<DecimalSource>(0) }
        }
    };
    const mastered = persistent<boolean>(false);
    const masteryEffectActive = computed(
        () => mastered.value || main.currentlyMastering.value?.name === name
    );

    return {
        name,
        day,
        color,
        plastic,
        totalPlastic,
        buildRefinery,
        activeRefinery,
        oilCost,
        upgrades,
        elfUpgrades,
        buyables,
        generalTabCollapsed,
        minWidth: 700,
        display: jsx(() => (
            <>
                {render(trackerDisplay)}
                <Spacer />
                {masteryEffectActive.value ? (
                    <>
                        <div class="decoration-effect ribbon">
                            Decoration effect:
                            <br />
                            Unlock a new elf for training, and upgrades go up in cost slower
                        </div>
                        <Spacer />
                    </>
                ) : null}
                <MainDisplay
                    resource={plastic}
                    color={color}
                    style="margin-bottom: 0"
                    effectDisplay={
                        Decimal.gt(computedPlasticGain.value, 0)
                            ? `+${format(computedPlasticGain.value)}/s`
                            : undefined
                    }
                />
                <Spacer />
                <Column>
                    {render(buildRefinery)}
                    <div>
                        {formatWhole(Decimal.floor(activeRefinery.value))}/
                        {formatWhole(Decimal.floor(buildRefinery.amount.value))}
                    </div>
                    {renderRow(minRefinery, removeRefinery, addRefinery, maxRefinery)}
                </Column>
                <Row>
                    {renderCol(paperTools, paperElf, passivePaper)}
                    {renderCol(boxTools, boxElf, passiveBoxes)}
                    {renderCol(clothTools, clothElf, clothGains)}
                </Row>
            </>
        )),
        minimizedDisplay: jsx(() => (
            <div>
                {name}{" "}
                <span class="desc">
                    {format(plastic.value)} {plastic.displayName}
                </span>
            </div>
        )),
        mastery,
        mastered,
        masteryEffectActive
    };
});

export default layer;
