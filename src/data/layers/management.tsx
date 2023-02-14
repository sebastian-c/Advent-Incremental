import Spacer from "components/layout/Spacer.vue";
import Sqrt from "components/math/Sqrt.vue";
import Modal from "components/Modal.vue";
import { createCollapsibleMilestones, createCollapsibleModifierSections } from "data/common";
import { main } from "data/projEntry";
import { createBar, GenericBar } from "features/bars/bar";
import { createRepeatable, GenericRepeatable } from "features/repeatable";
import { createClickable } from "features/clickables/clickable";
import { jsx, showIf, Visibility } from "features/feature";
import { createMilestone, GenericMilestone } from "features/milestones/milestone";
import { createUpgrade } from "features/upgrades/upgrade";
import { globalBus } from "game/events";
import { createLayer } from "game/layers";
import {
    createAdditiveModifier,
    createMultiplicativeModifier,
    createSequentialModifier,
    Modifier
} from "game/modifiers";
import { persistent } from "game/persistence";
import Decimal, { DecimalSource, format, formatTime, formatWhole } from "util/bignum";
import { Direction, WithRequired } from "util/common";
import { render, renderCol, renderGrid } from "util/vue";
import { computed, ComputedRef, ref, Ref, unref, watchEffect } from "vue";
import boxes from "./boxes";
import cloth from "./cloth";
import coal from "./coal";
import dyes from "./dyes";
import metal from "./metal";
import oil from "./oil";
import paper from "./paper";
import plastic from "./plastic";
import trees from "./trees";

import "./styles/management.css";
import { createResource, Resource } from "features/resources/resource";
import { isArray } from "@vue/shared";
import routing from "./routing";
import packing from "./packing";
import elves from "./elves";
import { createCostRequirement } from "game/requirements";

const id = "management";
const day = 12;
const advancedDay = 13;

const layer = createLayer(id, () => {
    const name = "Management";
    const color = "green"; // idk what to do

    // ------------------------------------------------------------------------------- Day Progress

    const dayProgress = createBar(() => ({
        direction: Direction.Right,
        width: 600,
        height: 25,
        fillStyle: `backgroundColor: ${color}`,
        progress: () =>
            main.day.value === day
                ? day12Elves.reduce((acc, curr) => acc + Math.min(1, curr.level.value / 3), 0) /
                  day12Elves.length
                : main.day.value === advancedDay && main.days[advancedDay - 1].opened.value
                ? day13Elves.reduce((acc, curr) => acc + Math.min(1, curr.level.value / 5), 0) /
                  day13Elves.length
                : 1,
        display: jsx(() =>
            main.day.value === day ||
            (main.day.value === advancedDay && main.days[advancedDay - 1].opened.value) ? (
                <>
                    {formatWhole(
                        Decimal.times(
                            unref(dayProgress.progress),
                            main.day.value === advancedDay ? 80 : 36
                        )
                    )}
                    /{main.day.value === advancedDay ? 80 : 36} elf levels
                </>
            ) : (
                ""
            )
        )
    })) as GenericBar;

    const totalElfLevels = computed(() => {
        let elfLevel = 0;
        for (const elf of Object.values(elfTraining)) {
            elfLevel += elf.level.value;
        }
        return elfLevel;
    });
    const totalElfExp = computed(() =>
        Object.values(elfTraining).reduce((acc, curr) => acc.add(curr.exp.value), new Decimal(0))
    );
    const level5Elves = computed(
        () => Object.values(elfTraining).filter(elf => elf.level.value >= 5).length
    );

    // ------------------------------------------------------------------------------- Upgrades

    const teaching = createUpgrade(() => ({
        display: {
            title: "Teach the Elves",
            description:
                "The Elves probably need to be taught if they're to do better. Maybe you'll build a school so you can teach them?"
        },
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e21
        })),
        visibility: () => showIf(!main.isMastery.value)
    }));

    const classroomUpgrade = createUpgrade(() => ({
        display: {
            title: "Add a Classroom?",
            description:
                "Yay, you have a school. Too bad it has pretty much nothing in it. Maybe you could add some classrooms to make it less boring and more enticing to the Elves?"
        },
        visibility: () => showIf(teaching.bought.value),
        style: "width: 150px",
        requirements: createCostRequirement(() => ({
            resource: boxes.boxes,
            cost: 1e13
        }))
    }));
    const advancedUpgrade = createUpgrade(() => ({
        display: {
            title: "Advanced Training",
            description:
                "Time for some advanced training! Now that all the elves know the basics, you have a foundation you can truly build off of. Everyone seems to be learning twice as quickly!"
        },
        visibility: () =>
            showIf(
                !main.isMastery.value &&
                    main.day.value >= advancedDay &&
                    main.days[advancedDay - 1].opened.value
            ),
        style: "width: 150px",
        requirements: createCostRequirement(() => ({
            resource: boxes.boxes,
            cost: 1e25
        }))
    }));
    const globalXPModifier = createSequentialModifier(() => [
        createMultiplicativeModifier(() => ({
            multiplier: classroomEffect,
            description: "Classroom Effect",
            enabled: classroomUpgrade.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Advanced Training",
            enabled: advancedUpgrade.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Star Level 4",
            enabled: paperElfMilestones[3].earned
        })),
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Carry experience in boxes???",
            enabled: boxes.row3Upgrades.xpUpgrade.bought
        }))
    ]) as WithRequired<Modifier, "description" | "revert">;
    const globalXPModifierComputed = computed(() => globalXPModifier.apply(1));

    // ------------------------------------------------------------------------------- Training core function

    function createElfTraining(
        elf: {
            name: string;
            computedAutoBuyCooldown: ComputedRef<DecimalSource>;
            amountOfTimesDone: Ref<number>;
            bought: Ref<boolean>;
        },
        milestones: Array<GenericMilestone>,
        ...modifiers: Modifier[]
    ) {
        const exp = persistent<DecimalSource>(0);
        let costMulti =
            [
                "Holly",
                "Ivy",
                "Hope",
                "Jack",
                "Mary",
                "Noel",
                "Joy",
                "Faith",
                "Snowball",
                "Star",
                "Bell",
                "Gingersnap",
                "Peppermint",
                "Frosty",
                "Cocoa",
                "Twinkle",
                "Carol",
                "Tinsel",
                "Jingle"
            ].indexOf(elf.name) + 1;
        if (elf.name == "Star" || elf.name == "Bell") {
            costMulti /= 3;
        }
        if (elf.name == "Jingle") {
            costMulti *= 100000;
        }
        const costBase = 4000 * costMulti;
        const expRequiredForNextLevel = computed(() => Decimal.pow(5, level.value).mul(costBase));
        const level = computed(() =>
            Decimal.affordGeometricSeries(exp.value, costBase, 5, 0)
                .min(routing.metaMilestones[1].earned.value ? Infinity : schools.amount.value)
                .toNumber()
        );
        const expToNextLevel = computed(() =>
            Decimal.sub(exp.value, Decimal.sumGeometricSeries(level.value, costBase, 5, 0))
        );
        const bar = createBar(() => ({
            direction: Direction.Right,
            width: 160,
            height: 14,
            style: () => ({
                "margin-top": "8px",
                background: color,
                "box-shadow":
                    currentShown.value == elf.name
                        ? "0 0 12px black"
                        : focusTargets.value[elf.name]
                        ? "0 0 12px white"
                        : ""
            }),
            baseStyle: "margin-top: -1px",
            fillStyle: () => ({
                "margin-top": "-1px",
                "transition-duration": "0s",
                background: "white",
                animation: focusTargets.value[elf.name] ? ".5s focused-xp-bar linear infinite" : ""
            }),
            borderStyle: () =>
                !routing.metaMilestones[1].earned.value &&
                Decimal.gte(level.value, schools.amount.value)
                    ? "border-color: red"
                    : "",
            progress: () => Decimal.div(expToNextLevel.value, expRequiredForNextLevel.value),
            display: jsx(() =>
                !routing.metaMilestones[1].earned.value &&
                Decimal.gte(level.value, schools.amount.value) ? (
                    <>Limit reached</>
                ) : (
                    <>
                        {format(expToNextLevel.value)}/{format(expRequiredForNextLevel.value)} XP
                    </>
                )
            )
        }));
        const { collapseMilestones: state, display: displayMilestone } =
            createCollapsibleMilestones(milestones as Record<number, GenericMilestone>);
        const elfXPGain = createSequentialModifier(() => [
            createMultiplicativeModifier(() => ({
                multiplier: globalXPModifierComputed,
                description: "Global XP Multiplier"
            })),
            createMultiplicativeModifier(() => ({
                multiplier: focusMulti,
                description: "Focus Multiplier",
                enabled: () =>
                    Decimal.gt(focusTime.value, 0) && focusTargets.value[elf.name] == true
            })),
            ...modifiers
        ]);
        const elfXPGainComputed = computed(() => elfXPGain.apply(0.1));
        const click = createClickable(() => ({
            display: {
                title: jsx(() => (
                    <>
                        {elf.name} - LV {formatWhole(level.value)}
                    </>
                )),
                description: jsx(() => (
                    <>
                        {elf.name} can buy buyables {formatWhole(elf.computedAutoBuyCooldown.value)}{" "}
                        times per second, gaining{" "}
                        {!routing.metaMilestones[1].earned.value &&
                        Decimal.gte(level.value, schools.amount.value)
                            ? 0
                            : format(
                                  Decimal.mul(
                                      elfXPGainComputed.value,
                                      elf.computedAutoBuyCooldown.value
                                  )
                              )}{" "}
                        XP/sec.
                        {render(bar)}
                    </>
                ))
            },
            style: () => ({
                width: "190px",
                background: currentShown.value == elf.name ? "var(--accent2)" : ""
            }),
            onClick() {
                currentShown.value = elf.name;
            },
            canClick() {
                return currentShown.value !== elf.name;
            },
            visibility: () => showIf(elf.bought.value),
            name: elf.name,
            state,
            displayMilestone,
            level,
            exp,
            milestones,
            timeForExp: elf.computedAutoBuyCooldown,
            amountOfTimesDone: elf.amountOfTimesDone,
            elfXPGainComputed,
            elfXPGain
        }));
        return click;
    }

    // ------------------------------------------------------------------------------- Elf milestones

    const cutterElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Holly Level 1",
                effectDisplay: jsx(() => (
                    <>
                        Multiply log gain by <sup>9</sup>
                        <Sqrt>Cutter amount</Sqrt>
                    </>
                ))
            },
            shouldEarn: () => cutterElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Holly Level 2",
                effectDisplay: "Holly now buys max"
            },
            visibility: () => showIf(cutterElfMilestones[0].earned.value),
            shouldEarn: () => cutterElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Holly Level 3",
                effectDisplay: jsx(() => (
                    <>
                        Multiply all cloth actions' effectiveness by log<sub>10</sub>(Cutter amount)
                    </>
                ))
            },
            visibility: () => showIf(cutterElfMilestones[1].earned.value),
            shouldEarn: () => cutterElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Holly Level 4",
                effectDisplay: "Multiply auto cutting amount by 1.1 per day completed"
            },
            visibility: () => showIf(cutterElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => cutterElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Holly Level 5",
                effectDisplay: "Unlock an elf that autobuys oil drills and extractors"
            },
            visibility: () => showIf(cutterElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => cutterElfTraining.level.value >= 5,
            onComplete() {
                main.days[3].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const planterElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Ivy Level 1",
                effectDisplay: "Planters are now twice as efficent"
            },
            shouldEarn: () => planterElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Ivy Level 2",
                effectDisplay: "Ivy now buys max"
            },
            visibility: () => showIf(planterElfMilestones[0].earned.value),
            shouldEarn: () => planterElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Ivy Level 3",
                effectDisplay: jsx(() => (
                    <>
                        Auto planting speed is multiplied by 2
                        <sup>
                            (log<sub>10</sub>(trees<sup>0.2</sup>))
                        </sup>
                    </>
                ))
            },
            visibility: () => showIf(planterElfMilestones[1].earned.value),
            shouldEarn: () => planterElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Ivy Level 4",
                effectDisplay: "Divide planter cost by 10"
            },
            visibility: () => showIf(planterElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => planterElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Ivy Level 5",
                effectDisplay:
                    "The lesser of auto planting and cutting amounts is increased to match the greater"
            },
            visibility: () => showIf(planterElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => planterElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const expanderElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Hope Level 1",
                effectDisplay: "Forest size grows by trees planted per second raised to ^0.99"
            },
            shouldEarn: () => expandersElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Hope Level 2",
                effectDisplay: "Hope now buys max"
            },
            visibility: () => showIf(expanderElfMilestones[0].earned.value),
            shouldEarn: () => expandersElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Hope Level 3",
                effectDisplay: "The workshop can be expanded past 100%, but costs scale faster"
            },
            visibility: () => showIf(expanderElfMilestones[1].earned.value),
            shouldEarn: () => expandersElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Hope Level 4",
                effectDisplay: "Unlock an elf that autobuys coal drills"
            },
            visibility: () => showIf(expanderElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => expandersElfTraining.level.value >= 4,
            onComplete() {
                main.days[3].recentlyUpdated.value = true;
            }
        })),
        createMilestone(() => ({
            display: {
                requirement: "Hope Level 5",
                effectDisplay: "Raise workshop expansion cost by 0.99"
            },
            visibility: () => showIf(expanderElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => expandersElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const heatedCutterElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Jack Level 1",
                effectDisplay: '"Fahrenheit 451" affects "Heated Cutters" twice'
            },
            shouldEarn: () => heatedCutterElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jack Level 2",
                effectDisplay: "Coal gain is raised to the ^1.05"
            },
            visibility: () => showIf(heatedCutterElfMilestones[0].earned.value),
            shouldEarn: () => heatedCutterElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jack Level 3",
                effectDisplay: "Jack and Joy now buy max"
            },
            visibility: () => showIf(heatedCutterElfMilestones[1].earned.value),
            shouldEarn: () => heatedCutterElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jack Level 4",
                effectDisplay: jsx(() => (
                    <>
                        Oil gain is multiplied by <Sqrt>total elf levels</Sqrt>
                    </>
                ))
            },
            visibility: () =>
                showIf(heatedCutterElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => heatedCutterElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jack Level 5",
                effectDisplay: "Unlock an elf that autobuys oil-using machines"
            },
            visibility: () =>
                showIf(heatedCutterElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => heatedCutterElfTraining.level.value >= 5,
            onComplete() {
                main.days[3].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const heatedPlanterElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Mary Level 1",
                effectDisplay: `"Tillamook Burn Country" affects "Heated Planters" twice`
            },
            shouldEarn: () => heatedPlanterElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Mary Level 2",
                effectDisplay: "Metal gain is raised to the 1.1"
            },
            visibility: () => showIf(heatedPlanterElfMilestones[0].earned.value),
            shouldEarn: () => heatedPlanterElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Mary Level 3",
                effectDisplay: "Mary, Noel, and Faith now buy max"
            },
            visibility: () => showIf(heatedPlanterElfMilestones[1].earned.value),
            shouldEarn: () => heatedPlanterElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Mary Level 4",
                effectDisplay: "Double automatic tree planting speed"
            },
            visibility: () =>
                showIf(heatedPlanterElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => heatedPlanterElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Mary Level 5",
                effectDisplay: jsx(() => (
                    <>
                        Auto smelting speed is multiplied by <Sqrt>total XP/1e6</Sqrt>
                    </>
                ))
            },
            visibility: () =>
                showIf(heatedPlanterElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => heatedPlanterElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const fertilizerElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Noel Level 1",
                effectDisplay: jsx(() => (
                    <>
                        Log gain is multiplied by <Sqrt>total elf levels</Sqrt>
                    </>
                ))
            },
            shouldEarn: () => fertilizerElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Noel Level 2",
                effectDisplay: `"The Garden Tree's Handbook" affects "Fertilized Soil" twice`
            },
            visibility: () => showIf(fertilizerElfMilestones[0].earned.value),
            shouldEarn: () => fertilizerElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Noel Level 3",
                effectDisplay: "Divide the coal drill cost by ln(Total logs + e)"
            },
            visibility: () => showIf(fertilizerElfMilestones[1].earned.value),
            shouldEarn: () => fertilizerElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Noel Level 4",
                effectDisplay: jsx(() => (
                    <>
                        Reduce oil refinery cost by (Plastic amount)<sup>2</sup>
                    </>
                ))
            },
            visibility: () =>
                showIf(fertilizerElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => fertilizerElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Noel Level 5",
                effectDisplay: "Unlock an elf that autobuys metal machines"
            },
            visibility: () =>
                showIf(fertilizerElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => fertilizerElfTraining.level.value >= 5,
            onComplete() {
                main.days[3].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const smallfireElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Joy Level 1",
                effectDisplay: "Small Fire synergy counts bonfires at reduced rate"
            },
            shouldEarn: () => smallfireElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Joy Level 2",
                effectDisplay: "Raise ash gain to the 1.1"
            },
            visibility: () => showIf(smallfireElfMilestones[0].earned.value),
            shouldEarn: () => smallfireElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Joy Level 3",
                effectDisplay: "Coal drill is 2x more powerful"
            },
            visibility: () => showIf(smallfireElfMilestones[1].earned.value),
            shouldEarn: () => smallfireElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Joy Level 4",
                effectDisplay: "Metal gain is boosted by heavy drills"
            },
            visibility: () =>
                showIf(smallfireElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => smallfireElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Joy Level 5",
                effectDisplay: "Raise Industrial Crucible's effect to the 1.1"
            },
            visibility: () =>
                showIf(smallfireElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => smallfireElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const bonfireElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Faith Level 1",
                effectDisplay: "Multiply bonfire efficiency by 5"
            },
            shouldEarn: () => bonfireElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Faith Level 2",
                effectDisplay: "Raise ash gain to the 1.1"
            },
            visibility: () => showIf(bonfireElfMilestones[0].earned.value),
            shouldEarn: () => bonfireElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Faith Level 3",
                effectDisplay: "Coal drill is 2x more powerful"
            },
            visibility: () => showIf(bonfireElfMilestones[1].earned.value),
            shouldEarn: () => bonfireElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Faith Level 4",
                effectDisplay: "Oil gain is boosted by heavy drill drills"
            },
            visibility: () => showIf(bonfireElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => bonfireElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Faith Level 5",
                effectDisplay: "Raise Industrial Crucible's effect to the 1.1"
            },
            visibility: () => showIf(bonfireElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => bonfireElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const kilnElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Snowball Level 1",
                effectDisplay: "Multiply kiln efficiency by 5"
            },
            shouldEarn: () => kilnElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Snowball Level 2",
                effectDisplay: "Raise ash gain to the 1.1"
            },
            visibility: () => showIf(kilnElfMilestones[0].earned.value),
            shouldEarn: () => kilnElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Snowball Level 3",
                effectDisplay: "Coal drill is 2x more powerful"
            },
            visibility: () => showIf(kilnElfMilestones[1].earned.value),
            shouldEarn: () => kilnElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Snowball Level 4",
                effectDisplay: "Plastic gain is boosted by heavy extractors"
            },
            visibility: () => showIf(kilnElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => kilnElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Snowball Level 5",
                effectDisplay: "Raise Industrial Crucible's effect to the 1.1"
            },
            visibility: () => showIf(kilnElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => kilnElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const paperElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Star Level 1",
                effectDisplay: "Book cost is divided by total books bought"
            },
            shouldEarn: () => paperElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Star Level 2",
                effectDisplay: "Pulp requires 10x less ash"
            },
            visibility: () => showIf(paperElfMilestones[0].earned.value),
            shouldEarn: () => paperElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Star Level 3",
                effectDisplay: "Book cost scaling 5x -> 4x"
            },
            visibility: () => showIf(paperElfMilestones[1].earned.value),
            shouldEarn: () => paperElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Star Level 4",
                effectDisplay: "Double all elf xp gain"
            },
            visibility: () => showIf(paperElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => paperElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Star Level 5",
                effectDisplay: "Gain 5 free books for all prior elves that are at level 5 or above"
            },
            visibility: () => showIf(paperElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => paperElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const boxElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Bell Level 1",
                effectDisplay: jsx(() => (
                    <>
                        Every box buyable adds <Sqrt>level</Sqrt> levels to same-row box buyables
                    </>
                ))
            },
            shouldEarn: () => boxElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Bell Level 2",
                effectDisplay: "Box gain ^1.1"
            },
            visibility: () => showIf(boxElfMilestones[0].earned.value),
            shouldEarn: () => boxElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Bell Level 3",
                effectDisplay: "All box buyables scaling bases -1"
            },
            visibility: () => showIf(boxElfMilestones[1].earned.value),
            shouldEarn: () => boxElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Bell Level 4",
                effectDisplay: "Unlock a second row of box buyables"
            },
            visibility: () => showIf(boxElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => boxElfTraining.level.value >= 4,
            onComplete() {
                main.days[5].recentlyUpdated.value = true;
            }
        })),
        createMilestone(() => ({
            display: {
                requirement: "Bell Level 5",
                effectDisplay: "Unlock another row of box upgrades"
            },
            visibility: () => showIf(boxElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => boxElfTraining.level.value >= 5,
            onComplete() {
                main.days[5].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const clothElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Gingersnap Level 1",
                effectDisplay: "Multiply all primary dye colors by ln(cloth + e)"
            },
            shouldEarn: () => clothElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Gingersnap Level 2",
                effectDisplay: jsx(() => (
                    <>
                        Multiply all cloth actions' effectiveness by log<sub>10</sub>(dye sum + 10)
                    </>
                ))
            },
            visibility: () => showIf(clothElfMilestones[0].earned.value),
            shouldEarn: () => clothElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Gingersnap Level 3",
                effectDisplay: "Double all dye colors and cloth actions"
            },
            visibility: () => showIf(clothElfMilestones[1].earned.value),
            shouldEarn: () => clothElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Gingersnap Level 4",
                effectDisplay: "Raise secondary dyes' first effects to the 1.1"
            },
            visibility: () => showIf(clothElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => clothElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Gingersnap Level 5",
                effectDisplay: "Unlock another row of focus upgrades"
            },
            visibility: () => showIf(clothElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => clothElfTraining.level.value >= 5,
            onComplete() {
                main.days[12].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const coalDrillElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Peppermint Level 1",
                effectDisplay: "The coal drill exponent is increased from 2 to 2.5"
            },
            shouldEarn: () => coalDrillElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Peppermint Level 2",
                effectDisplay: "Coal boosts its own gain"
            },
            visibility: () => showIf(coalDrillElfMilestones[0].earned.value),
            shouldEarn: () => coalDrillElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Peppermint Level 3",
                effectDisplay: "The coal drill cost is 10x cheaper"
            },
            visibility: () => showIf(coalDrillElfMilestones[1].earned.value),
            shouldEarn: () => coalDrillElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Peppermint Level 4",
                effectDisplay: "Unlock 3 coal upgrades"
            },
            visibility: () =>
                showIf(coalDrillElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => coalDrillElfTraining.level.value >= 4,
            onComplete() {
                main.days[2].recentlyUpdated.value = true;
            }
        })),
        createMilestone(() => ({
            display: {
                requirement: "Peppermint Level 5",
                effectDisplay: "Well depth boosts coal gain an additional half time"
            },
            visibility: () =>
                showIf(coalDrillElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => coalDrillElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const metalElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Twinkle Level 1",
                effectDisplay: "Schools multiply metal gain per ore"
            },
            shouldEarn: () => metalElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Twinkle Level 2",
                effectDisplay: "Each Twinkle level multiplies auto smelting speed by 1.25"
            },
            visibility: () => showIf(metalElfMilestones[0].earned.value),
            shouldEarn: () => metalElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Twinkle Level 3",
                effectDisplay: "Auto smelting multi is tripled"
            },
            visibility: () => showIf(metalElfMilestones[1].earned.value),
            shouldEarn: () => metalElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Twinkle Level 4",
                effectDisplay: "All metal machines are 10x cheaper"
            },
            visibility: () => showIf(metalElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => metalElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Twinkle Level 5",
                effectDisplay: jsx(() => (
                    <>
                        <Sqrt>Well depth</Sqrt> divides metal machine costs
                    </>
                ))
            },
            visibility: () => showIf(metalElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => metalElfTraining.level.value >= 5
        }))
    ] as Array<GenericMilestone>;
    const oilElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Cocoa Level 1",
                effectDisplay: "The depth boost to oil gain is better"
            },
            shouldEarn: () => oilElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Cocoa Level 2",
                effectDisplay: "Total oil gained boosts drill power"
            },
            visibility: () => showIf(oilElfMilestones[0].earned.value),
            shouldEarn: () => oilElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Cocoa Level 3",
                effectDisplay: "Double drill power and oil gain"
            },
            visibility: () => showIf(oilElfMilestones[1].earned.value),
            shouldEarn: () => oilElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Cocoa Level 4",
                effectDisplay: "Plastics are produced 5x faster but cost 5x as much oil"
            },
            visibility: () => showIf(oilElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => oilElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Cocoa Level 5",
                effectDisplay: "Unlock another row of oil upgrades"
            },
            visibility: () => showIf(oilElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => oilElfTraining.level.value >= 5,
            onComplete() {
                main.days[8].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const heavyDrillElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Frosty Level 1",
                effectDisplay: "Oil boosts Star and Bell's xp gain"
            },
            shouldEarn: () => heavyDrillElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Frosty Level 2",
                effectDisplay: "Oil pumps are 10x cheaper"
            },
            visibility: () => showIf(heavyDrillElfMilestones[0].earned.value),
            shouldEarn: () => heavyDrillElfTraining.level.value >= 2
        })),
        createMilestone(() => ({
            display: {
                requirement: "Frosty Level 3",
                effectDisplay: "Oil burners act like there are ^1.5 of them"
            },
            visibility: () => showIf(heavyDrillElfMilestones[1].earned.value),
            shouldEarn: () => heavyDrillElfTraining.level.value >= 3
        })),
        createMilestone(() => ({
            display: {
                requirement: "Frosty Level 4",
                effectDisplay: jsx(() => (
                    <>
                        Heavy drill drill's ln is now log<sub>2.5</sub>
                    </>
                ))
            },
            visibility: () =>
                showIf(heavyDrillElfMilestones[2].earned.value && main.day.value >= 13),
            shouldEarn: () => heavyDrillElfTraining.level.value >= 4
        })),
        createMilestone(() => ({
            display: {
                requirement: "Frosty Level 5",
                effectDisplay: "Unlock another row of paper upgrades"
            },
            visibility: () =>
                showIf(heavyDrillElfMilestones[3].earned.value && main.day.value >= 13),
            shouldEarn: () => heavyDrillElfTraining.level.value >= 5,
            onComplete() {
                main.days[4].recentlyUpdated.value = true;
            }
        }))
    ] as Array<GenericMilestone>;
    const dyeElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Carol Level 1",
                effectDisplay: "Double primary dye gain"
            },
            shouldEarn: () => dyeElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Carol Level 2",
                effectDisplay: "Double secondary dye gain"
            },
            shouldEarn: () => dyeElfTraining.level.value >= 2,
            visibility: () => showIf(dyeElfMilestones[0].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Carol Level 3",
                effectDisplay: "Buy maximum primary dyes"
            },
            shouldEarn: () => dyeElfTraining.level.value >= 3,
            visibility: () => showIf(dyeElfMilestones[1].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Carol Level 4",
                effectDisplay: "Secondary dyes don't spend primary dyes"
            },
            shouldEarn: () => dyeElfTraining.level.value >= 4,
            visibility: () => showIf(dyeElfMilestones[2].earned.value && main.day.value >= 16)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Carol Level 5",
                effectDisplay: "Buy maximum secondary dyes"
            },
            shouldEarn: () => dyeElfTraining.level.value >= 5,
            visibility: () => showIf(dyeElfMilestones[3].earned.value && main.day.value >= 16)
        }))
    ] as Array<GenericMilestone>;
    const plasticElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Tinsel Level 1",
                effectDisplay: "Double plastic gain"
            },
            shouldEarn: () => plasticElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Tinsel Level 2",
                effectDisplay: jsx(() => (
                    <>
                        Every plastic buyable adds <Sqrt>level</Sqrt> levels to the other plastic
                        buyables
                    </>
                ))
            },
            shouldEarn: () => plasticElfTraining.level.value >= 2,
            visibility: () => showIf(plasticElfMilestones[0].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Tinsel Level 3",
                effectDisplay: "Refineries don't spend oil"
            },
            shouldEarn: () => plasticElfTraining.level.value >= 3,
            visibility: () => showIf(plasticElfMilestones[1].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Tinsel Level 4",
                effectDisplay: "Increase plastic gain by +1% for each refinery"
            },
            shouldEarn: () => plasticElfTraining.level.value >= 4,
            visibility: () => showIf(plasticElfMilestones[2].earned.value && main.day.value >= 16)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Tinsel Level 5",
                effectDisplay: "Buy maximum plastic buyables"
            },
            shouldEarn: () => plasticElfTraining.level.value >= 5,
            visibility: () => showIf(plasticElfMilestones[3].earned.value && main.day.value >= 16)
        }))
    ] as Array<GenericMilestone>;
    const packingElfMilestones = [
        createMilestone(() => ({
            display: {
                requirement: "Jingle Level 1",
                effectDisplay: "Double elf packing speed"
            },
            shouldEarn: () => packingElfTraining.level.value >= 1
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jingle Level 2",
                effectDisplay: jsx(() => (
                    <>
                        Each elf assistant increases packing speed by 10%
                        <br />
                        Currently: +
                        {formatWhole(
                            Decimal.times(packing.helpers.elf.amount.value, 0.1).times(100)
                        )}
                        %
                    </>
                ))
            },
            shouldEarn: () => packingElfTraining.level.value >= 2,
            visibility: () => showIf(packingElfMilestones[0].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jingle Level 3",
                effectDisplay: jsx(() => (
                    <>
                        Multiply packing speed by the number of completed packing milestones
                        <br />
                        Currently:{" "}
                        {formatWhole(
                            Object.values(packing.packingMilestones).filter(
                                milestone => milestone.earned.value
                            ).length + 1
                        )}
                        x
                    </>
                ))
            },
            shouldEarn: () => packingElfTraining.level.value >= 3,
            visibility: () => showIf(packingElfMilestones[1].earned.value)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jingle Level 4",
                effectDisplay: "Jingle will now also buy loaders"
            },
            shouldEarn: () => packingElfTraining.level.value >= 4,
            visibility: () => showIf(packingElfMilestones[2].earned.value && main.day.value >= 16)
        })),
        createMilestone(() => ({
            display: {
                requirement: "Jingle Level 5",
                effectDisplay:
                    "Multipliers to elf packing speed also apply to loaders at reduced rate"
            },
            shouldEarn: () => packingElfTraining.level.value >= 5,
            visibility: () => showIf(packingElfMilestones[3].earned.value && main.day.value >= 16)
        }))
    ] as Array<GenericMilestone>;
    // ------------------------------------------------------------------------------- Milestone display

    const currentShown = persistent<string>("Holly");
    const currentElfDisplay = jsx(() => {
        const elf = Object.values(elfTraining).find(
            training => training.name === currentShown.value
        );
        if (elf == null) {
            console.warn("This should not happen.", currentShown.value);
            return "";
        }
        return (
            <>
                {currentShown.value}'s milestones: {elf.displayMilestone()}
            </>
        );
    });
    const cutterElfTraining = createElfTraining(elves.elves.cuttersElf, cutterElfMilestones);
    const planterElfTraining = createElfTraining(elves.elves.plantersElf, planterElfMilestones);
    const expandersElfTraining = createElfTraining(elves.elves.expandersElf, expanderElfMilestones);
    const treeElfTraining = [cutterElfTraining, planterElfTraining, expandersElfTraining];

    const heatedCutterElfTraining = createElfTraining(
        elves.elves.heatedCuttersElf,
        heatedCutterElfMilestones
    );
    const heatedPlanterElfTraining = createElfTraining(
        elves.elves.heatedPlantersElf,
        heatedPlanterElfMilestones
    );
    const fertilizerElfTraining = createElfTraining(
        elves.elves.fertilizerElf,
        fertilizerElfMilestones
    );
    const coalElfTraining = [
        heatedCutterElfTraining,
        heatedPlanterElfTraining,
        fertilizerElfTraining
    ];

    const smallfireElfTraining = createElfTraining(
        elves.elves.smallFireElf,
        smallfireElfMilestones
    );
    const bonfireElfTraining = createElfTraining(elves.elves.bonfireElf, bonfireElfMilestones);
    const kilnElfTraining = createElfTraining(elves.elves.kilnElf, kilnElfMilestones);
    const fireElfTraining = [smallfireElfTraining, bonfireElfTraining, kilnElfTraining];

    const paperElfTraining = createElfTraining(
        elves.elves.paperElf,
        paperElfMilestones,
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.add(oil.oil.value, 1).log10(),
            description: "Frosty Level 1",
            enabled: heavyDrillElfMilestones[0].earned
        }))
    );
    const boxElfTraining = createElfTraining(
        elves.elves.boxElf,
        boxElfMilestones,
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.add(oil.oil.value, 1).log10(),
            description: "Frosty Level 1",
            enabled: heavyDrillElfMilestones[0].earned
        }))
    );
    const clothElfTraining = createElfTraining(elves.elves.clothElf, clothElfMilestones);
    const plasticElvesTraining = [paperElfTraining, boxElfTraining, clothElfTraining];
    const coalDrillElfTraining = createElfTraining(
        elves.elves.coalDrillElf,
        coalDrillElfMilestones
    );
    const metalElfTraining = createElfTraining(elves.elves.metalElf, metalElfMilestones);
    const oilElfTraining = createElfTraining(elves.elves.oilElf, oilElfMilestones);
    const heavyDrillElfTraining = createElfTraining(
        elves.elves.heavyDrillElf,
        heavyDrillElfMilestones
    );
    const dyeElfTraining = createElfTraining(elves.elves.dyeElf, dyeElfMilestones);
    const plasticElfTraining = createElfTraining(elves.elves.plasticElf, plasticElfMilestones);
    const packingElfTraining = createElfTraining(elves.elves.packingElf, packingElfMilestones);
    const row5Elves = [coalDrillElfTraining, heavyDrillElfTraining, oilElfTraining];
    const row6Elves = [metalElfTraining, dyeElfTraining, plasticElfTraining];
    const row7Elves = [packingElfTraining];
    const elfTraining = {
        cutterElfTraining,
        planterElfTraining,
        expandersElfTraining,
        heatedCutterElfTraining,
        heatedPlanterElfTraining,
        fertilizerElfTraining,
        smallfireElfTraining,
        bonfireElfTraining,
        kilnElfTraining,
        paperElfTraining,
        boxElfTraining,
        clothElfTraining,
        coalDrillElfTraining,
        metalElfTraining,
        oilElfTraining,
        heavyDrillElfTraining,
        dyeElfTraining,
        plasticElfTraining,
        packingElfTraining
    };
    const day12Elves = [
        cutterElfTraining,
        planterElfTraining,
        expandersElfTraining,
        heatedCutterElfTraining,
        heatedPlanterElfTraining,
        fertilizerElfTraining,
        smallfireElfTraining,
        bonfireElfTraining,
        kilnElfTraining,
        paperElfTraining,
        boxElfTraining,
        clothElfTraining
    ];
    const day13Elves = [
        cutterElfTraining,
        planterElfTraining,
        expandersElfTraining,
        heatedCutterElfTraining,
        heatedPlanterElfTraining,
        fertilizerElfTraining,
        smallfireElfTraining,
        bonfireElfTraining,
        kilnElfTraining,
        paperElfTraining,
        boxElfTraining,
        clothElfTraining,
        coalDrillElfTraining,
        metalElfTraining,
        oilElfTraining,
        heavyDrillElfTraining
    ];

    // ------------------------------------------------------------------------------- Update

    globalBus.on("update", diff => {
        if (main.day.value < day) return;

        for (const elf of Object.values(elfTraining)) {
            const times = Math.floor(elf.amountOfTimesDone.value);
            if (times >= 1) {
                elf.amountOfTimesDone.value -= times;
                if (
                    routing.metaMilestones[1].earned.value ||
                    Decimal.lt(elf.level.value, schools.amount.value)
                )
                    elf.exp.value = Decimal.mul(elf.elfXPGainComputed.value, times).add(
                        elf.exp.value
                    );
            }
        }
        focusTime.value = Math.max(focusTime.value - diff, 0);
        focusCooldown.value = Math.max(focusCooldown.value - diff, 0);

        if (Decimal.eq(focusTime.value, 0)) {
            focusTargets.value = {};
            const speed = focusUpgrade5.bought.value ? 2000 : 1000;
            let stoppedAt = 1 - Math.abs(Math.sin((Date.now() / speed) * 2));
            if (focusUpgrade4.bought.value) {
                stoppedAt = 1 - (1 - stoppedAt) ** 2;
            }
            focusMulti.value = Decimal.pow(focusMaxMulti.value, stoppedAt);
        }
    });

    // ------------------------------------------------------------------------------- Focus

    const focusMulti = persistent<DecimalSource>(1);
    const focusTargets = persistent<Record<string, boolean>>({});
    const focusCooldown = persistent<number>(0);
    const focusTime = persistent<number>(0);

    const focusMaxMultiModifiers = createSequentialModifier(() => [
        createMultiplicativeModifier(() => ({
            multiplier: 2,
            description: "Focus Upgrade 1",
            enabled: focusUpgrade1.bought
        })),
        createMultiplicativeModifier(() => ({
            multiplier: () => Decimal.pow(2, packing.packingResets.value),
            description: `${format(6.4e9)} ${packing.packedPresents.displayName}`,
            enabled: packing.packingMilestones.moreFocus.earned
        }))
    ]) as WithRequired<Modifier, "revert" | "description">;
    const maximumElvesModifier = createSequentialModifier(() => [
        createAdditiveModifier(() => ({
            addend: 1,
            description: "Focus Upgrade 2",
            enabled: focusUpgrade2.bought
        })),
        createAdditiveModifier(() => ({
            addend: 1,
            description: "Focus Upgrade 6",
            enabled: focusUpgrade6.bought
        }))
    ]);

    const cooldownModifiers = createSequentialModifier(() => [
        createAdditiveModifier(() => ({
            addend: -5,
            description: "Focus Upgrade 3",
            enabled: focusUpgrade3.bought
        }))
    ]);

    const focusMaxMulti = computed(() => focusMaxMultiModifiers.apply(10));
    const maximumElves = computed(() => maximumElvesModifier.apply(3));
    const cooldown = computed(() => cooldownModifiers.apply(15));

    const focusMeter = createBar(() => ({
        direction: Direction.Right,
        width: 566,
        height: 50,
        style: `border-radius: 0`,
        borderStyle: `border-radius: 0`,
        fillStyle: () => ({
            background: focusTime.value > 0 ? color : "#7f7f00",
            animation: focusTime.value > 0 ? "1s focused-focus-bar linear infinite" : "",
            opacity: focusTime.value > 0 ? focusTime.value / 10 : 1,
            transition: "none"
        }),
        progress: () =>
            Decimal.sub(focusMulti.value, 1).div(Decimal.sub(focusMaxMulti.value, 1)).toNumber(),
        display: jsx(() => (
            <>
                {format(focusMulti.value)}x
                {focusTime.value > 0 ? (
                    <>
                        {" "}
                        to {Object.keys(focusTargets.value).join(", ")} for{" "}
                        {formatTime(focusTime.value)}
                    </>
                ) : (
                    ""
                )}
            </>
        ))
    })) as GenericBar;

    const focusButton = createClickable(() => ({
        display: {
            title: "Focus",
            description: jsx(() => (
                <>
                    Motivate elves to focus, multiplying {formatWhole(maximumElves.value)} random
                    elves' XP gain by up to {format(focusMaxMulti.value)}x for 10 seconds, equal to
                    the focus bar's effect.
                    {Decimal.gte(focusCooldown.value, 0) ? (
                        <>
                            <br />
                            Reroll cooldown: {formatTime(focusCooldown.value)}
                        </>
                    ) : (
                        ""
                    )}
                </>
            ))
        },
        style: {
            width: "570px",
            minHeight: "80px",
            zIndex: 4
        },
        canClick: () => Decimal.eq(focusCooldown.value, 0),
        onClick() {
            focusCooldown.value = Decimal.fromValue(cooldown.value).toNumber();
            focusTime.value = 10;
            rerollFocusTargets(
                Object.values(elfTraining).filter(
                    elf => unref(elf.visibility) === Visibility.Visible
                ).length,
                maximumElves.value
            );
        }
    }));

    function rerollFocusTargets(range: number, count: DecimalSource) {
        let x = 0;
        focusTargets.value = {};
        const newCount = Decimal.min(count, range);
        if (packing.packingMilestones.focusSelected.earned.value) {
            const elf = Object.values(elfTraining).find(
                training => training.name === currentShown.value
            );
            const roll = elf?.name ?? "";
            if (!focusTargets.value[roll] && unref(elf?.visibility) === Visibility.Visible) {
                focusTargets.value[roll] = true;
                x++;
            }
        }
        while (newCount.gt(x)) {
            const elf = Object.values(elfTraining)[Math.floor(Math.random() * range)];
            const roll = elf?.name ?? "";
            if (!focusTargets.value[roll] && unref(elf?.visibility) === Visibility.Visible) {
                focusTargets.value[roll] = true;
                x++;
            }
        }
    }
    const focusUpgrade1 = createUpgrade(() => ({
        display: {
            title: "Focus Booster",
            description: "Multiplies the maximum experience multiplier from focus by 2"
        },
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e25
        }))
    }));
    const focusUpgrade2 = createUpgrade(() => ({
        display: {
            title: "Focus Buffer",
            description: "Increase elves affected by focus by 1"
        },
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e28
        }))
    }));
    const focusUpgrade3 = createUpgrade(() => ({
        display: {
            title: "Focus Upgrader",
            description: "Focus can now be rerolled every 10 seconds"
        },
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e31
        }))
    }));
    const upgrades = [focusUpgrade1, focusUpgrade2, focusUpgrade3];
    const focusUpgrade4 = createUpgrade(() => ({
        display: {
            title: "Focus Improver",
            description:
                "The bar moves slower when it's closer to the right and faster when it's closer to the left"
        },
        visibility: () => showIf(elfTraining.clothElfTraining.milestones[4].earned.value),
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e34
        }))
    }));
    const focusUpgrade5 = createUpgrade(() => ({
        display: {
            title: "Focus Focuser",
            description: "The bar moves 2x slower"
        },
        visibility: () => showIf(elfTraining.clothElfTraining.milestones[4].earned.value),
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e35
        }))
    }));
    const focusUpgrade6 = createUpgrade(() => ({
        display: {
            title: "Focus Doubler",
            description: "Focus applies to an additional elf."
        },
        visibility: () => showIf(elfTraining.clothElfTraining.milestones[4].earned.value),
        requirements: createCostRequirement(() => ({
            resource: trees.logs,
            cost: 1e36
        }))
    }));
    const upgrades2 = [focusUpgrade4, focusUpgrade5, focusUpgrade6];
    // ------------------------------------------------------------------------------- Schools

    const schools = createRepeatable(() => ({
        requirements: [
            createCostRequirement(() => ({
                resource: trees.logs,
                cost() {
                    let woodFactor = Decimal.pow(2e4, Decimal.pow(schools.amount.value, 0.75));
                    if (Decimal.gte(schools.amount.value, 4)) {
                        woodFactor = woodFactor.div(1e3);
                    }
                    return woodFactor.mul(1e21);
                }
            })),
            createCostRequirement(() => ({
                resource: coal.coal,
                cost() {
                    const coalFactor = Decimal.pow(2000, schools.amount.value);
                    return coalFactor.mul(1e32);
                }
            })),
            createCostRequirement(() => ({
                resource: paper.paper,
                cost() {
                    const coalFactor = Decimal.pow(2000, schools.amount.value);
                    return coalFactor.mul(1e18);
                }
            })),
            createCostRequirement(() => ({
                resource: boxes.boxes,
                cost() {
                    let woodFactor = Decimal.pow(2e4, Decimal.pow(schools.amount.value, 0.75));
                    if (Decimal.gte(schools.amount.value, 4)) {
                        woodFactor = woodFactor.div(1e3);
                    }
                    return woodFactor.mul(1e13);
                }
            })),
            createCostRequirement(() => ({
                resource: metal.metal,
                cost() {
                    const nerfedSchoolFactor = Decimal.pow(4, schools.amount.value);
                    return nerfedSchoolFactor.mul(1e12);
                }
            })),
            createCostRequirement(() => ({
                resource: cloth.cloth,
                cost() {
                    const schoolFactor = Decimal.pow(10, schools.amount.value);
                    return schoolFactor.mul(1e4);
                }
            })),
            createCostRequirement(() => ({
                resource: plastic.plastic,
                cost() {
                    const nerfedSchoolFactor = Decimal.pow(4, schools.amount.value);
                    return nerfedSchoolFactor.mul(1e6);
                }
            })),
            createCostRequirement(() => ({
                resource: dyes.primaryDyes,
                cost() {
                    return Decimal.add(schools.amount.value, 1).mul(10000);
                }
            }))
        ],
        display: {
            title: "Build a School",
            description: jsx(() => (
                <>
                    <div>
                        You gotta start somewhere, right? Each school increases the maximum level
                        for elves by 1, maximum of {main.days[advancedDay - 1].opened.value ? 5 : 3}{" "}
                        schools.
                    </div>
                    <div>
                        You have {formatWhole(schools.amount.value)} schools, which are currently
                        letting elves learn up to level {formatWhole(schools.amount.value)}.
                    </div>
                </>
            ))
        },
        purchaseLimit() {
            if (main.days[advancedDay - 1].opened.value) return 5;
            return 3;
        },
        visibility: computed(() => showIf(teaching.bought.value)),
        style: "width: 600px"
    })) as GenericRepeatable;

    const classroomFactor = computed(() => {
        let v = classrooms.amount.value;
        if (Decimal.gte(v, 50)) v = Decimal.pow(v, 2).div(50);
        if (Decimal.gte(v, 200)) v = Decimal.pow(v, 2).div(200);
        return Decimal.add(v, 1).pow(1.5);
    });

    const classroomEffect = computed(() => {
        return Decimal.add(classrooms.amount.value, 1).pow(0.9);
    });

    const classrooms = createRepeatable(() => ({
        requirements: [
            createCostRequirement(() => ({
                resource: trees.logs,
                cost: () => classroomFactor.value.mul(1e21)
            })),
            createCostRequirement(() => ({
                resource: paper.paper,
                cost: () => classroomFactor.value.mul(1e18)
            })),
            createCostRequirement(() => ({
                resource: boxes.boxes,
                cost: () => classroomFactor.value.mul(1e13)
            })),
            createCostRequirement(() => ({
                resource: metal.metal,
                cost: () => classroomFactor.value.mul(1e12)
            }))
        ],
        display: {
            title: "Build a Classroom",
            description: jsx(() => (
                <>
                    <div>
                        Hopefully it makes the school a bit less boring. Multiplies elves' XP gain
                        by (Classrooms + 1)<sup>0.9</sup>.
                    </div>
                    <div>
                        You have {formatWhole(classrooms.amount.value)} classrooms, which are
                        currently multiplying elves' XP gain by {format(classroomEffect.value)}
                    </div>
                </>
            ))
        },
        visibility: computed(() => showIf(classroomUpgrade.bought.value)),
        style: "width: 600px"
    })) as GenericRepeatable;

    // ------------------------------------------------------------------------------- Modifiers

    const [generalTab, generalTabCollapsed] = createCollapsibleModifierSections(() => [
        {
            title: "Elves affected by Focus",
            modifier: maximumElvesModifier,
            base: 3
        },
        {
            title: "Maximum Focus Effect",
            modifier: focusMaxMultiModifiers,
            base: 10
        },
        {
            title: "Focus Cooldown",
            modifier: cooldownModifiers,
            unit: " secs",
            base: 15
        },
        {
            title: "Global XP Gain",
            modifier: globalXPModifier,
            unit: " XP"
        },
        {
            title: "Holly XP Gain per Action",
            modifier: cutterElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Ivy XP Gain per Action",
            modifier: planterElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Hope XP Gain per Action",
            modifier: expandersElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Jack XP Gain per Action",
            modifier: heatedCutterElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Mary XP Gain per Action",
            modifier: heatedPlanterElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Noel XP Gain per Action",
            modifier: fertilizerElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Joy XP Gain per Action",
            modifier: smallfireElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Faith XP Gain per Action",
            modifier: bonfireElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Snowball XP Gain per Action",
            modifier: kilnElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Star XP Gain per Action",
            modifier: paperElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Bell XP Gain per Action",
            modifier: boxElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Gingersnap XP Gain per Action",
            modifier: clothElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Peppermint XP Gain per Action",
            modifier: coalDrillElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Frosty XP Gain per Action",
            modifier: heavyDrillElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Cocoa XP Gain per Action",
            modifier: oilElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Twinkle XP Gain per Action",
            modifier: metalElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Carol XP Gain per Action",
            modifier: dyeElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Tinsel XP Gain per Action",
            modifier: plasticElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
        },
        {
            title: "Jingle XP Gain per Action",
            modifier: packingElfTraining.elfXPGain,
            base: 0.1,
            unit: " XP"
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

    watchEffect(() => {
        if (main.day.value === day && day12Elves.every(elf => elf.level.value >= 3)) {
            main.completeDay();
        } else if (
            main.day.value === advancedDay &&
            day12Elves.every(elf => elf.level.value >= 5) &&
            day13Elves.every(elf => elf.level.value >= 5)
        ) {
            main.completeDay();
        }
    });

    const mastery = {
        elfTraining: {
            bonfireElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            boxElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            clothElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            coalDrillElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            cutterElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            expandersElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            fertilizerElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            heatedCutterElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            heatedPlanterElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            heavyDrillElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            kilnElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            metalElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            oilElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            paperElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            planterElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            smallfireElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            dyeElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            },
            plasticElfTraining: {
                exp: persistent<DecimalSource>(0),
                milestones: [
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) },
                    { earned: persistent<boolean>(false) }
                ]
            }
        },
        teaching: { bought: persistent<boolean>(false) },
        schools: { amount: persistent<DecimalSource>(0) },
        classrooms: { amount: persistent<DecimalSource>(0) },
        classroomUpgrade: { bought: persistent<boolean>(false) },
        advancedUpgrade: { bought: persistent<boolean>(false) },
        upgrades: [
            { bought: persistent<boolean>(false) },
            { bought: persistent<boolean>(false) },
            { bought: persistent<boolean>(false) }
        ],
        upgrades2: [
            { bought: persistent<boolean>(false) },
            { bought: persistent<boolean>(false) },
            { bought: persistent<boolean>(false) }
        ],
        focusMulti: persistent<DecimalSource>(1),
        focusTargets: persistent<Record<string, boolean>>({}),
        focusCooldown: persistent<number>(0),
        focusTime: persistent<number>(0)
    };

    // ------------------------------------------------------------------------------- Return

    return {
        name,
        day,
        color,
        minWidth: 700,

        elfTraining,
        totalElfLevels,
        totalElfExp,
        level5Elves,
        currentShown,
        generalTabCollapsed,

        teaching,
        schools,
        classrooms,
        classroomUpgrade,
        advancedUpgrade,

        focusMulti,
        upgrades,
        upgrades2,
        focusTargets,
        focusCooldown,
        focusTime,

        display: jsx(() => (
            <>
                {main.day.value === day
                    ? `Get all elves to level 3.`
                    : main.day.value === advancedDay && main.days[advancedDay - 1].opened.value
                    ? `Get all elves to level 5.`
                    : `${name} Complete!`}{" "}
                -
                <button
                    class="button"
                    style="display: inline-block;"
                    onClick={() => (showModifiersModal.value = true)}
                >
                    Check Modifiers
                </button>
                {render(modifiersModal)}
                {render(dayProgress)}
                <br />
                {renderCol(schools, classrooms)}
                {renderGrid([teaching, classroomUpgrade, advancedUpgrade])}
                <Spacer />
                {Decimal.gt(schools.amount.value, 0) ? (
                    <>
                        <Spacer />
                        Click on an elf to see their milestones.
                        <Spacer />
                        <Spacer />
                        {renderGrid(upgrades, upgrades2)}
                        <Spacer />
                        {renderGrid(
                            [focusButton],
                            [focusMeter],
                            treeElfTraining,
                            coalElfTraining,
                            fireElfTraining,
                            plasticElvesTraining,
                            row5Elves,
                            row6Elves,
                            row7Elves
                        )}
                        <Spacer />
                        {currentElfDisplay()}
                    </>
                ) : (
                    ""
                )}
            </>
        )),

        mastery
    };
});

export default layer;
