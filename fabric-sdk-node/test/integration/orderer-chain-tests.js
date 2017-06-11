/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

if (global && global.hfc) global.hfc.config = undefined;
require('nconf').reset();
var utils = require('fabric-client/lib/utils.js');
utils.setConfigSetting('hfc-logging', '{"debug":"console"}');
var logger = utils.getLogger('orderer-chain');


var tape = require('tape');
var _test = require('tape-promise');
var test = _test(tape);

var util = require('util');
var fs = require('fs');
var path = require('path');

var testUtil = require('../unit/util.js');

var hfc = require('fabric-client');
var Orderer = require('fabric-client/lib/Orderer.js');
var Chain = require('fabric-client/lib/Chain.js');

var keyValStorePath = testUtil.KVS;
hfc.addConfigFile(path.join(__dirname, 'e2e', 'config.json'));
var ORGS = hfc.getConfigSetting('test-network');

var client = new hfc();

//
// Orderer via member missing orderer
//
// Attempt to send a request to the orderer with the sendTransaction method
// before the orderer URL was set. Verify that an error is reported when tying
// to send the request.
//
test('\n\n** TEST ** orderer via member missing orderer', function(t) {
	testUtil.resetDefaults();
	utils.setConfigSetting('key-value-store', 'fabric-ca-client/lib/impl/FileKeyValueStore.js');//force for 'gulp test'
	//
	// Create and configure the test chain
	//
	var chain = client.newChain('testChain-orderer-member2');

	hfc.newDefaultKeyValueStore({
		path: testUtil.KVS
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t);
	}
	).then(
		function(admin) {
			t.pass('Successfully enrolled user \'admin\'');

			// send to orderer
			return chain.sendTransaction('data');
		},
		function(err) {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			t.end();
		}
	).then(
		function(status) {
			t.comment('Status: ' + status + ', type: (' + typeof status + ')');
			if (status === 0) {
				t.fail('Successfully submitted request, which is bad because the chain is missing orderers.');
			} else {
				t.pass('Successfully tested invalid submission due to missing orderers. Error code: ' + status);
			}

			t.end();
		},
		function(err) {
			t.comment('Error: ' + err);
			t.pass('Successfully tested invalid submission due to missing orderers. Error code: ' + err);
			t.end();
		}
	).catch(function(err) {
		t.fail('Failed request. ' + err);
		t.end();
	});
});

//
// Orderer via member null data
//
// Attempt to send a request to the orderer with the sendTransaction method
// with the data set to null. Verify that an error is reported when tying
// to send null data.
//
test('\n\n** TEST ** orderer via member null data', function(t) {
	//
	// Create and configure the test chain
	//
	var chain = client.newChain('testChain-orderer-member3');
	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));
	let caroots = Buffer.from(data).toString();

	chain.addOrderer(
		new Orderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);

	testUtil.getSubmitter(client, t)
	.then(
		function(admin) {
			t.pass('Successfully enrolled user \'admin\'');

			// send to orderer
			return chain.sendTransaction(null);
		},
		function(err) {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			t.end();
		}
	).then(
		function(status) {
			if (status === 0) {
				t.fail('Successfully submitted request, which is bad because the submission was missing data');
				t.end();
			} else {
				t.pass('Successfully tested invalid submission due to null data. Error code: ' + status);

				return chain.sendTransaction('some non-null but still bad data');
			}
		},
		function(err) {
			t.pass('Failed to submit. Error code: ' + err);
			t.end();
		}
	).then(
		function(status) {
			if (status === 0) {
				t.fail('Successfully submitted request, which is bad because the submission was using bad data');
				t.end();
			} else {
				t.pass('Successfully tested invalid submission due to bad data. Error code: ' + status);
				t.end();
			}
		},
		function(err) {
			t.pass('Failed to submit. Error code: ' + err);
			t.end();
		}
	).catch(function(err) {
		t.pass('Failed request. ' + err);
		t.end();
	});
});

//
// Orderer via member bad orderer address
//
// Attempt to send a request to the orderer with the sendTransaction method
// with the orderer address set to a bad URL. Verify that an error is reported
// when tying to send the request.
//
test('\n\n** TEST ** orderer via member bad request', function(t) {
	//
	// Create and configure the test chain
	//
	var chain = client.newChain('testChain-orderer-member4');

	// Set bad orderer address here
	var caRootsPath = ORGS.orderer.tls_cacerts;
	let data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));
	let caroots = Buffer.from(data).toString();

	chain.addOrderer(
		new Orderer(
			'grpcs://localhost:5199',
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		)
	);

	testUtil.getSubmitter(client, t)
	.then(
		function(admin) {
			t.pass('Successfully enrolled user \'admin\'');

			// send to orderer
			var request = {
				proposalResponses: 'blah',
				proposal: 'blah',
				header: 'blah'
			};
			return chain.sendTransaction(request);
		},
		function(err) {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			t.end();
		}
	).then(
		function(status) {
			t.comment('Status: ' + status + ', type: (' + typeof status + ')');
			if (status === 0) {
				t.fail('Successfully submitted request, which is bad because request is invalid');
			} else {
				t.pass('Successfully tested invalid submission due to the invalid request. Error code: ' + status);
			}
			t.end();
		},
		function(err) {
			t.comment('Failed to submit. Error: ');
			t.pass('Error :' + err.stack ? err.stack : err);
			t.end();
		}
	).catch(function(err) {
		t.comment('Failed to submit orderer request.  Error: ');
		t.pass('Error: ' + err);
		t.end();
	});
});

