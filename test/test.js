/*global module, test, ant, document */
module("test");

/*
 * Important state machine transitions
 * main ---fail response--> main
 * main ---request timeout--> main
 * main ---success, no delta--> main
 * main ---success, delta--> delta
 * delta ---fail response--> main
 * delta ---request timeout--> main
 * delta ---success, no delta--> main
 * delta ---success, delta--> delta
 * delta ---success, 204 No Content--> delta
 */

/*
 * Important variants
 * long poll (autoFetch) / manual fetch
 * synchronous ajax responses (if these are possible?)
 */

asyncTest("State graph traversal (autoFetch)", function () {
	'use strict';
	/*global URI, weblinking, strictEqual
	*/

	/* 
	 * Sequence:
	 * main ---fail response--> main
	 * main ---request timeout--> main
	 * main ---success, no delta--> main
	 * main ---success, delta--> delta
	 * (delta ---fail response--> main)
	 * main --->success, delta--> delta
	 * (delta ---request timeout--> main)
	 * main ---success, delta--> delta
	 * delta ---success, no delta--> main
	 * main --->success, delta--> delta
	 * delta ---success, delta--> delta
	 * (delta ---success, 204 No Content--> delta)
	 */
	
	var sequence = [], expectCount=0, index=0;
	sequence.push({
			type: "main failed",
			response:{
				url: "/main",
				responseText: "main1",
				status: 404
			}}); expectCount += 2;
	sequence.push({
			type: "main failed",
			response:{
				url: "/main",
				isTimeout: true
			}}); expectCount += 1;  // no progress due to timeout
	// No progress due to timeout
	sequence.push({
			type: "main done",
			response:{
				url: "/main",
				contentType: "text/plain",
				responseText: "main2"
			}}); expectCount += 2;
	sequence.push({
			type: "main done",
			response:{
				url: "/main",
				contentType: "text/plain",
				responseText: "main3",
				headers: {Link: '</delta/1>; rel="delta"'}
			}}); expectCount += 2;
	sequence.push({
		type: "delta failed",
		response:{
			url: "/delta/1",
			responseText: "delta1",
			status: 404
		}}); expectCount += 1; // progress, but no callback
	sequence.push({
		type: "main done",
		response:{
			url: "/main",
			contentType: "text/plain",
			responseText: "main4",
			headers: {Link: '</delta/2>; rel="delta"'}
		}}); expectCount += 2;
	sequence.push({
		type: "delta failed",
		response:{
			url: "/delta/2",
			isTimeout: true,
		}}); expectCount += 0; // no progress or callback
	sequence.push({
		type: "main done",
		response:{
			url: "/main",
			contentType: "text/plain",
			responseText: "main5",
			headers: {Link: '</delta/3>; rel="delta"'}
		}}); expectCount += 2;
	sequence.push({
		type: "delta done",
		response:{
			url: "/delta/3",
			contentType: "text/plain",
			responseText: "delta3",
			headers: {Link: '</delta/4>; rel="next"'}
		}}); expectCount += 2;
	sequence.push({
		type: "delta done",
		response:{
			url: "/delta/4",
			status: 204
		}}); expectCount += 1; // progress, but no callback

	expect(expectCount);

	// Start with failure case
	$.mockjax(sequence[0].response);

	var sde = sdeclient.create("/main", {});

	sde.mainDoneCallbacks.add(function (data) {
		var ii = index++;
		var current = sequence[ii];
		var next = sequence[index];
		strictEqual(data, current.response.responseText);
		$.mockjaxClear();
		$.mockjax(next.response);
   	});

	sde.deltaDoneCallbacks.add(function (data) {
		var ii = index++;
		var current = sequence[ii];
		var next = sequence[index];
		strictEqual(data, current.response.responseText);
		$.mockjaxClear();
		$.mockjax(next.response);
	});

	sde.failedCallbacks.add(function (data) {
		var ii = index++;
		var current = sequence[ii];
		var next = sequence[index];
		strictEqual(current.type, "main failed", "Check failure is from main resource");
		$.mockjaxClear();
		$.mockjax(next.response);
   	});

	sde.progressCallbacks.add(function (data) {
		var current = sequence[index];

		ok(true, "Progress made");
		
		if (current.type == "delta failed") {
			var ii = index++;
			var current = sequence[ii];
			var next = sequence[index];
			$.mockjaxClear();
			$.mockjax(next.response);
		}
		if (index == sequence.length-1) {
			$.mockjaxClear();
			sde.stop();
			start();
		}
	});
});

asyncTest("Simple manual fetch sequence", function () {
	'use strict';
	/*global URI, weblinking, strictEqual
	*/
	expect(7);

	$.mockjax({
		url: "/main",
		contentType: "text/plain",
		responseText: "main1",
		headers: {Link: '</delta/1>; rel="delta"'}
	});

	$.mockjax({
		url: "/delta/1",
		contentType: "text/plain",
		responseText: "delta1",
		headers: {Link: '</delta/2>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/2",
		status: 204
	});
	
	var sde = sdeclient.create("/main", {timeout_ms: 0});
	var sequence = 0;

	sde.mainDoneCallbacks.add(function (data) {
		strictEqual(sequence, 0); ++sequence;
		strictEqual(data, "main1", "Check main fetch");
		sde.fetch();
   	});

	sde.deltaDoneCallbacks.add(function (data) {
		strictEqual(sequence, 2); ++sequence;
		strictEqual(data, "delta1", "Check delta fetch");
		sde.fetch();
	});

	sde.progressCallbacks.add(function (data) {
		ok(sequence in {1:1, 3:3, 4:4}, "Progress made"); ++sequence;
		if (sequence == 5) {
			sde.stop();
			$.mockjaxClear();
			start();
		}
	});
	
	sde.fetch();
});
