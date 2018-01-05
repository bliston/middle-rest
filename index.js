// http://localhost:5000/next-melody-note?leapstart_notename=C2&leapend_notename=D2&prev_melody_notename=C3&scale_to_traverse_keyname=C&scale_to_traverse_name=pentatonic

// http://localhost:5000/next-middle-chord-notes?code=C(C:Major)|E7sus4(A:harmonic%20minor)&index=0
// http://localhost:5000/next-middle-melody-note?code=C(C:Major)|E7sus4(A:harmonic%20minor)&index=0&leapstart_notename=C2&leapend_notename=D2&prev_melody_notename=F3

var defaultChordOctave = 4

var express = require('express')
var s11 = require('sharp11')
var _ = require('underscore')
var app = express()

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))
app.use(express.json())       // to support JSON-encoded bodies
app.use(express.urlencoded())

app.get('/midi-thru', function(request, response) {
	var midi = request.query.midi
  response.json({'midi': midi})
})

app.get('/next-melody-note', function(request, response) {
	response.json(nextMelodyNoteQuery(request, response))
})

app.get('/next-middle-chord-notes', function(request, response) {
	response.json(nextMiddleChordNotesQuery(request, response))
})

app.get('/next-middle-melody-note', function(request, response) {
	response.json(nextMiddleMelodyNoteQuery(request, response))
})

function nextMiddleChordNotesQuery(request, response) {
	var middleCodeResults = middleCodeSharp11Results(
			request.query.code
		)
	var chordNotes = chordNoteValues(middleCodeResults[request.query.index % middleCodeResults.length].chord)
	return {midi : chordNotes }
	
}

function nextMiddleMelodyNoteQuery(request, response) {
	var middleCodeResults = middleCodeSharp11Results(
		request.query.code
	)
	melodyResult = nextMelodyNote(
		request.query.leapstart_notename
		, request.query.leapend_notename
		, request.query.prev_melody_notename
		, middleCodeResults[request.query.index % middleCodeResults.length].scale.key
		, middleCodeResults[request.query.index % middleCodeResults.length].scale.name
	)
	return {midi: [melodyResult.nextMelodyNoteVal]} 

}

function nextMelodyNoteQuery(request, response) {
	return nextMelodyNote(
			request.query.leapstart_notename
			, request.query.leapend_notename
			, request.query.prev_melody_notename
			, request.query.scale_to_traverse_keyname
			, request.query.scale_to_traverse_name
		)
}

function middleCodeSharp11Results(code) {
	// C(C:Major)|E7sus4(A:harmonic minor)
	return _.map(middleCodeStringResults(code), function(middleCodeStringResult){
		return {
			'chord' : s11.chord.create(middleCodeStringResult.chordName, defaultChordOctave)
			,'scale' : s11.scale.create(middleCodeStringResult.scaleKeyName, middleCodeStringResult.scaleName)
		}
	})
}

function middleCodeStringResults(code) {
	// C(C:Major)|E7sus4(A:harmonic minor)
	var chordScaleStrings = code.split('|')
	return _.map(chordScaleStrings, function(chordScaleString){
		var chordString = chordScaleString.split('(')[0]
		var scaleString = chordScaleString.split('(')[1].replace(')', '')
		var scaleKey = scaleString.split(':')[0]
		var scaleName = scaleString.split(':')[1]
		console.log(chordString)
		console.log(scaleString)
		console.log(scaleKey)
		console.log(scaleName)
		return {
			'chordName' : chordString
			,'scaleKeyName' : scaleKey
			,'scaleName' : scaleName
		}
	})
}

function chordNoteValues(chord) {
	return _.map(chord.chord, function(note){
		return note.value()
	})
}

function nextMelodyNote(leapStartNoteName, leapEndNoteName, prevMelodyNoteName, scaleToTraverseKeyName, scaleToTraverseName) {
	var leapStartNote = s11.note.create(leapStartNoteName)
	var leapEndNote = s11.note.create(leapEndNoteName)
	var prevMelodyNote = s11.note.create(prevMelodyNoteName)
	var scaleToTraverse = s11.scale.create(scaleToTraverseKeyName, scaleToTraverseName)
	
	console.log(scaleToTraverse.key.fullName)
	console.log(scaleToTraverse.name)
	console.log(scaleToTraverse.toString())
	
	var defaultPrevMelodyNote = scaleToTraverse.nearest(s11.note.create('C4'))

	var lastMelodyNote = prevMelodyNote || defaultPrevMelodyNote
	var numWhiteNotesBetweenNotes = countWhiteNotesBetweenNotes(leapStartNote, leapEndNote)
	var leapNonZero = Math.abs(leapEndNote.value() - leapStartNote.value()) > 0

	var leapInScaleSteps = numWhiteNotesBetweenNotes == 0 ? (leapNonZero ? 1 : 0) : numWhiteNotesBetweenNotes
  	console.log(leapInScaleSteps)
  	var leapDirectionDown = leapStartNote.value() > leapEndNote.value()  

	var lastNoteInScale = scaleToTraverse.nearest(lastMelodyNote)
	traversableScale = scaleToTraverse.traverse(lastNoteInScale)

	var scaleSnapDirectionDown = lastMelodyNote.value() > lastNoteInScale.value()

	var scaleSnapZero = lastMelodyNote.value() == lastNoteInScale.value()

	var signedLeapInScaleSteps = leapInScaleSteps * (leapDirectionDown ? -1 : 1)
	
	var isLastNoteInScaleSufficientWithoutShift = false
	
	// take one away from shift if the scale note snap agrees with the leap direction
	if(!scaleSnapZero && signedLeapInScaleSteps > 0 && !scaleSnapDirectionDown) {
		signedLeapInScaleSteps--
	}
	else if(!scaleSnapZero && signedLeapInScaleSteps < 0 && scaleSnapDirectionDown) {
		signedLeapInScaleSteps++
	}

	traversableScale = traversableScale.shift(signedLeapInScaleSteps)
  	var nextMelodyNote = traversableScale.current()
  	return {'lastMelodyNoteName': lastMelodyNote.fullName, 'lastMelodyNoteVal': lastMelodyNote.value(),'nextMelodyNoteName': nextMelodyNote.fullName,'nextMelodyNoteVal': nextMelodyNote.value()}
}

function countWhiteNotesBetweenNotes(note1, note2) {
	var orderedNotes = _.sortBy([note1, note2], function(note){ return note.value() })
	var betweenNoteValues = _.range(orderedNotes[0].value(), orderedNotes[1].value())
	var noteValsBetween = _.countBy(betweenNoteValues, function(val){return s11.note.fromValue(val).clean().accidental === 'n' ? 'natural' : 'unatural' })
	return noteValsBetween.natural
}

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
