// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const csv = require('csv');
const fs = require('fs');
const util = require('util');

const db = require('../util/db');
const model = require('../model/entity');
const schemaModel = require('../model/schema');
const user = require('../util/user');
const platform = require('../util/platform');
const tokenizer = require('../util/tokenize');

var router = express.Router();

/**
    frequently appearing tokens in the company stock dataset
     41 bancshares
     41 index
     41 technology
     43 ishares
     47 trust
     48 energy
     49 incorporated
     51 capital
     52 limited
     58 systems
     64 fund
     66 first
     69 pharmaceuticals
     78 technologies
     79 company
     83 holdings
     87 international
    120 ltd
    125 group
    137 financial
    144 corp
    159 bancorp
    471 corporation
*/
/*const IGNORED_WORDS = new Set(["in", "is", "of", "or", "not", "at", "as", "by", "my", "i", "from", "for", "an",
    "on", "a", "to", "with", "and", "when", "notify", "monitor", "it",
    "me", "the", "if", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwz",

    "bancshares", "index", "technology", "ishares", "trust", "energy", "incorporated", "capital",
    "limited", "systems", "fund", "first", "pharmaceuticals", "technologies", "company", "holdings",
    "international", "ltd", "group", "financial", "corp", "bancorp", "corporation"]);*/

async function uploadEntity(dbClient, req) {
    const language = 'en';

    let match = NAME_REGEX.exec(req.body.entity_id);
    if (match === null)
        throw new Error('Invalid entity type ID');
    if (!req.body.entity_name)
        throw new Error('Invalid entity name');

    let [, prefix, /*suffix*/] = match;

    if (req.user.developer_status < user.DeveloperStatus.ADMIN) {
        try {
            const row = await schemaModel.getByKind(dbClient, prefix);
            if (row.owner !== req.user.developer_org) throw new Error();
        } catch (e) {
            console.log('err', e.message);
            throw new Error('The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization');
        }
    }

    await model.create(dbClient, {
        name: req.body.entity_name,
        id: req.body.entity_id,
        is_well_known: false,
        has_ner_support: !req.body.no_ner_support
    });
    if (req.body.no_ner_support)
        return;

    if (!req.files.upload || !req.files.upload.length)
        throw new Error(req._("You must upload a CSV file with the entity values."));

    let insertBatch = [];

    function insert(entityId, entityValue, entityCanonical, entityName) {
        insertBatch.push([language, entityId, entityValue, entityCanonical, entityName]);
        if (insertBatch.length < 100)
            return Promise.resolve();

        let batch = insertBatch;
        insertBatch = [];
        return db.insertOne(dbClient,
            "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [batch]);
    }
    function finish() {
        if (insertBatch.length === 0)
            return Promise.resolve();
        return db.insertOne(dbClient,
            "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [insertBatch]);
    }

    const parser = csv.parse({ delimiter: ',' });
    fs.createReadStream(req.files.upload[0].path).pipe(parser);

    const promises = [];
    await new Promise((resolve, reject) => {
        parser.on('data', (row) => {
            if (row.length !== 2)
                return;

            const value = row[0].trim();
            const name = row[1];

            const tokens = tokenizer.tokenize(name);
            const canonical = tokens.join(' ');
            promises.push(insert(req.body.entity_id, value, canonical, name));
        });
        parser.on('error', reject);
        parser.on('end', resolve);
    });
    await Promise.all(promises);
    await finish();
}

async function createEntity(req, res) {
    try {
        try {
            await db.withTransaction((dbClient) => {
                return uploadEntity(dbClient, req);
            });
        } finally {
            if (req.files.upload && req.files.upload.length)
                await util.promisify(fs.unlink)(req.files.upload[0].path);
        }

        res.redirect(303, '/thingpedia/entities');
    } catch (e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }
}

router.post('/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    createEntity(req, res).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               csrfToken: req.csrfToken(),
                                               entities: rows });
    }).catch(next);
});

router.get('/by-id/:id', (req, res, next) => {
    db.withClient((dbClient) => {
        return Promise.all([model.get(dbClient, req.params.id), model.getValues(dbClient, req.params.id)]);
    }).then(([entity, values]) => {
        res.render('thingpedia_entity_values', { page_title: req._("Thingpedia - Entity Values"),
                                                 entity: entity,
                                                 values: values });
    }).catch(next);
});

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

module.exports = router;
