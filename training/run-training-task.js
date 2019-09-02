// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const events = require('events');

const trainingJobModel = require('../model/training_job');
const modelsModel = require('../model/nlp_models');
const db = require('../util/db');

const Tasks = require('./tasks');

class Task extends events.EventEmitter {
    constructor(jobId, jobDir) {
        super();
        this.jobId = jobId;
        this.jobDir = jobDir;

        this.killed = false;
    }

    get language() {
        return this.jobInfo.language;
    }

    async load() {
        await db.withTransaction(async (dbClient) => {
            this.info = await trainingJobModel.get(dbClient, this.jobId);
            this.config = JSON.parse(this.jobInfo.config);

            this.modelInfo = null;
            if (this.info.model_tag !== null) {
                this.modelInfo = (await modelsModel.getByTag(dbClient, this.language, this.info.model_tag))[0];
                if (!this.modelInfo) {
                    // the model was deleted since the job was scheduled, or some other weirdness
                    throw new Error('The model this job refers to no longer exists');
                }
            }

            this.forDevices = await trainingJobModel.readForDevices(dbClient, this.jobId);
        }, 'repeatable read', 'read only');
    }

    kill() {
        this.killed = true;
        this.emit('killed');
    }

    setProgress() {
        // TODO
    }
    setMetrics() {
        // TODO
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('run-training-task', {
            help: 'Run a training task',
        });

        parser.addArgument('-t', '--task-name', {
            help: 'The name of the task to run',
            choices: Object.keys(Tasks),
            required: true
        });

        parser.addArgument('--job-id', {
            help: 'The ID of the job to run',
            type: Number,
            required: true
        });
        parser.addArgument('--job-directory', {
            help: 'The directory where to save job specific files',
            required: true
        });

        parser.addArgument('--debug', {
            nargs: 0,
            action: 'storeTrue',
            help: 'Enable debugging.',
            defaultValue: false
        });
        parser.addArgument('--no-debug', {
            nargs: 0,
            action: 'storeFalse',
            dest: 'debug',
            help: 'Disable debugging.',
        });
    },

    async main(argv) {
        const task = new Task(argv.job_id, argv.job_directory);
        process.on('SIGINT', () => task.kill());
        process.on('SIGTERM', () => task.kill());

        await Tasks[argv.task_name](task, argv);

        await db.tearDown();
    }
};
