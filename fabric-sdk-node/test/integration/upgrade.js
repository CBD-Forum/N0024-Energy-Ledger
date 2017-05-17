/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';

process.env.HFC_LOGGING = '{"debug": "console"}';
var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var path = require('path');
var fs = require('fs');
var util = require('util');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var testUtil = require('../unit/util.js');
var logger = utils.getLogger('upgrade-chaincode');

test('\n\n **** E R R O R  T E S T I N G on upgrade call', (t) => {

	var e2e = testUtil.END2END;
	hfc.addConfigFile(path.join(__dirname, './e2e/config.json'));
	var ORGS = hfc.getConfigSetting('test-network');

	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname, '/test', caRootsPath));
	let caroots = Buffer.from(data).toString();

	var tx_id = null;
	var nonce = null;
	var the_user = null;
	var allEventhubs = [];

	testUtil.setupChaincodeDeploy();

	var version = 'v1';
	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(e2e.channel);
	chain.addOrderer(
		client.newOrderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);
	var orgName = ORGS[org].name;

	var targets = [];
	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer1') === 0) {
				let data = fs.readFileSync(path.join(__dirname, '/test', ORGS[org][key]['tls_cacerts']));
				let peer = client.newPeer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				targets.push(peer);
				chain.addPeer(peer);
			}
		}
	}

	hfc.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	})
	.then((store) => {
		client.setStateStore(store);

		return testUtil.getSubmitter(client, t, org);

	})
	.then((admin) => {
		t.pass('Successfully enrolled user \'admin\'');
		the_user = admin;

		return chain.initialize();

	})
	.then((nothing) => {
		t.pass('Successfully initialized channel');
		nonce = utils.getNonce();
		tx_id = hfc.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId : e2e.chaincodeId,
			chaincodeVersion : version,
			chainId: e2e.channel,
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'same version exists', t);

		return Promise.resolve(true);

	}, (err) => {
		t.fail('This should not have thrown an Error ::'+ err);
		return Promise.resolve(true);
	}).then((nothing) => {
		nonce = utils.getNonce();
		tx_id = hfc.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId: 'dummy',
			chaincodeVersion: version,
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'chaincode not found', t);

		return Promise.resolve(true);

	}).then((nothing) => {
		nonce = utils.getNonce();
		tx_id = hfc.buildTransactionID(nonce, the_user);

		// send proposal to endorser
		var request = {
			chaincodePath: testUtil.CHAINCODE_UPGRADE_PATH,
			chaincodeId: e2e.chaincodeId,
			chaincodeVersion: 'v333333333',
			fcn: 'init',
			args: ['a', '500', 'b', '600'],
			chainId: e2e.channel,
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendUpgradeProposal(request);

	}).then((results) => {
		checkResults(results, 'no such file or directory', t);
		t.end();
	}).catch((err) => {
		t.fail('Got an Error along the way :: '+ err);
		t.end();
	});
});

function checkResults(results, error_snip, t) {
	var proposalResponses = results[0];
	for(var i in proposalResponses) {
		let proposal_response = proposalResponses[i];
		if(proposal_response instanceof Error) {
			logger.info(' Got the error ==>%s<== when looking for %s', proposal_response,error_snip);
			if(proposal_response.toString().indexOf(error_snip) > 0) {
				t.pass(' Successfully got the error '+ error_snip);
			}
			else {
				t.fail(' Failed to get error '+ error_snip);
			}
		}
		else {
			t.fail(' Failed to get an error returned :: No Error returned , should have had an error with '+ error_snip);
		}
	}
}

