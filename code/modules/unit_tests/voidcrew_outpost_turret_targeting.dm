/**
 * Outpost defense turrets shoot marked aggressors, xenos and hostile wildlife, and
 * nothing else.
 *
 * The stock turret scan only ever looks at humans, so before the outpost turret grew its
 * own scan a xeno or a carp could stroll through the concourse untouched. The wildlife
 * rule is read off the mob's AI planning subtrees (voidcrew/_HELPERS/hostile_creatures.dm),
 * so an upstream merge that reshuffles the basic-mob AI tree can silently flip a shopper's
 * pet into a target. Pin both ends down here.
 */
/datum/unit_test/voidcrew_outpost_turret_targeting

/datum/unit_test/voidcrew_outpost_turret_targeting/Run()
	var/obj/structure/overmap/trader_outpost/outpost = allocate(/obj/structure/overmap/trader_outpost)
	outpost.outpost_template = allocate(/datum/map_template/trader_outpost)
	outpost.outpost_template.width = 1
	outpost.outpost_template.height = 1
	outpost.template_bottom_left = run_loc_floor_bottom_left
	var/obj/machinery/porta_turret/outpost/turret = allocate(/obj/machinery/porta_turret/outpost)
	turret.outpost = outpost

	// Xenos are shot on sight: no warning strikes, whether or not a player is driving.
	var/static/list/xenos = list(
		/mob/living/carbon/alien/larva,
		/mob/living/carbon/alien/adult/drone,
		/mob/living/basic/alien/drone,
	)
	for(var/mob_type in xenos)
		var/mob/living/xeno = allocate(mob_type)
		TEST_ASSERT(turret.valid_target(xeno), "the turret refused to shoot [mob_type] on sight")
	var/mob/living/carbon/alien/adult/drone/player_xeno = allocate(/mob/living/carbon/alien/adult/drone)
	player_xeno.mind_initialize()
	TEST_ASSERT(turret.valid_target(player_xeno), "the turret made a player-driven xeno earn strikes before firing")

	// Wild hostiles that come looking for a fight.
	var/static/list/threats = list(
		/mob/living/basic/bear,
		/mob/living/basic/carp,
		/mob/living/basic/spider/giant,
		/mob/living/basic/trooper/pirate/faction/silverscale/melee,
	)
	for(var/mob_type in threats)
		var/mob/living/threat = allocate(mob_type)
		TEST_ASSERT(turret.valid_target(threat), "the turret refused to shoot [mob_type], which hunts targets unprovoked")

	// Shoppers, their pets, livestock and the outpost's own staff.
	var/static/list/bystanders = list(
		/mob/living/carbon/human/consistent,
		/mob/living/basic/cow,
		/mob/living/basic/goat,
		/mob/living/basic/pet/dog/corgi,
		/mob/living/basic/pet/cat,
		/mob/living/basic/carp/pet,
		/mob/living/basic/outpost_trader,
		/mob/living/basic/outpost_loiterer,
	)
	for(var/mob_type in bystanders)
		var/mob/living/bystander = allocate(mob_type)
		TEST_ASSERT(!turret.valid_target(bystander), "the turret opened fire on [mob_type], which never started anything")

	// A player riding a wild creature is not wildlife: no shot until the strike ladder says so.
	var/mob/living/basic/bear/possessed = allocate(/mob/living/basic/bear)
	possessed.mind_initialize()
	TEST_ASSERT(!turret.valid_target(possessed), "the turret shot a player-driven bear that had done nothing")
	outpost.aggressor_minds[possessed.mind] = TRUE
	TEST_ASSERT(turret.valid_target(possessed), "the turret ignored a marked aggressor because they were riding a bear")

	// The strike ladder still works for people.
	var/mob/living/carbon/human/aggressor = allocate(/mob/living/carbon/human/consistent)
	aggressor.mind_initialize()
	TEST_ASSERT(!turret.valid_target(aggressor), "the turret shot a shopper with a clean record")
	outpost.aggressor_minds[aggressor.mind] = TRUE
	TEST_ASSERT(turret.valid_target(aggressor), "the turret held fire on a marked aggressor")

	// Corpses are not targets, whatever they were.
	var/mob/living/basic/carp/dead_carp = allocate(/mob/living/basic/carp)
	dead_carp.death()
	TEST_ASSERT(!turret.valid_target(dead_carp), "the turret kept shooting a dead carp")
