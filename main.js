var React = require('react')
var drop = require('drag-and-drop-files');
var createReadStream = require('filereader-stream');
var csv = require('csv-parser');
var through2 = require('through2');
var Q = require('q')
var es = require('event-stream');
var _ = require('lodash');
var moment = require('moment');

var readDiary = function(file) {
  return Q.Promise(function(resolve, reject) {
    var stream = createReadStream(file)
    .pipe(csv())
    .pipe(through2.obj(function(chunk, enc, cb) {
      chunk['Watched Date'] = moment(chunk['Watched Date'], 'YYYY-MM-DD').unix();
      chunk['Date'] = moment(chunk['Date'], 'YYYY-MM-DD').unix();
      cb(null, chunk);
    }))
    .pipe(es.writeArray(function(err, data) {
      resolve(data);
    }))
    .on('error', function(err) {
      reject(err);
    });
  });
}

// Listen for dropped files
// 
var HeatMap = React.createClass({
  componentDidMount: function() {
    this.cal = new CalHeatMap()

    this.cal.init({
      domain: 'year',
      subDomain: 'day',
      range: 1,
      tooltip: true,
      data: this.props.data,
      maxDate: new Date(),
      legend: [1, 2, 3, 4],
      legendColors: ['#2C3641', '#BBCCDD'],
      itemName: 'star',
      onClick: function(date) {
        this.cal.highlight(date);
        this.props.selectDay(date);
      }.bind(this)
    });
  },
  render: function() {
    return <div>
      <div id="cal-heatmap"></div>
      <div id="button-container">
        <button id="prev" className="pure-button" onClick={this.previous}>Previous</button>
        <button id="next" className="pure-button" onClick={this.next}>Next</button>
      </div>
    </div>;
  },
  previous: function() {
    this.cal.previous();
  },
  next: function() {
    this.cal.next();
  }
})


var App = React.createClass({
  getInitialState: function () { return { data: [] } },
  componentDidMount: function() {
    var self = this;
    drop(document.body, function(files) {
      var first = files[0];
      if(!first) throw 'No file was dropped!';
      readDiary(first)
      .then(function(data) {
        self.setState({data: data});
      })
      .done();
    });
  },
  render: function () {
    if(!this.state.data.length) {
      return <div>
        <h2>Instructions</h2>
        <ol>
          <li><strong>Export</strong> your data from <a target="_blank" href="http://letterboxd.com/settings/data/">Letterboxd</a></li>
          <li><strong>Extract</strong> the .zip file</li>
          <li><strong>Drag & drop</strong> the <strong><code>diary.csv</code></strong> file onto this page</li>
        </ol>
      </div>
    }

    var detail;
    var dayData = _.filter(this.state.data, 'Watched Date', this.state.currentDay);
    if(this.state.currentDay && dayData.length) {
      detail = <div>
        <h2>Diary Entries for {moment.unix(this.state.currentDay).format('ll')}</h2>
        <p>Average stars: {_(dayData).sum('Rating') / dayData.length}</p>
        <ul>
          {
            _.map(dayData, function(row) {
              return <li key={row['Letterboxd URI']}>
                <span className="rating">{_.repeat('★', ~~(+row['Rating'])) + (row['Rating'] % 1 != 0 ? '½' : '' )}</span>
                <span className="title">{row['Name']} {row['Year'] ? '('+row['Year']+')' : null}</span>
              </li>
            })
          }
        </ul>
      </div>
    }
    else if(this.state.currentDay) {
      detail = <div>
        <h2>Diary Entries for {moment.unix(this.state.currentDay).format('ll')}</h2>
        <p>No ratings on this day</p>
      </div>
    }
    else {
      detail = <p>Click on a day to see the diary entries for that day</p>;
    }

    var streaks = _(this.state.data)
    .groupBy('Watched Date')
    .keys()
    .sortBy(_.first)
    .reduce(function(streaks, date) {
      var date = moment.unix(date);
      var last = _.last(_.last(streaks));
      if(last && date.clone().subtract(1, 'day').dayOfYear() === last.dayOfYear()) {
        _.last(streaks).push(date);
      }
      else {
        streaks.push([date]);
      }
      last = date;
      return streaks;
    }, []);

    var totalRatings = this.state.data.length;
    var longestStreak = _.max(streaks, 'length');
    var currentStreak = _.last(_.last(streaks)).dayOfYear() === moment().dayOfYear() ?
      _.last(streaks) : null;

    var format = 'MMM D YYYY';
    var shortFormat = 'MMM D';

    return <div>
      <HeatMap data={this.formattedData()} selectDay={this.selectDay} />
      <div id="stats">
        <div>
          <p><small>Diary entries this year</small></p>
          <h3>{totalRatings} total</h3>
          <p><small>{moment().dayOfYear(1).format(format)} – {moment().format(format)}</small></p>
        </div>
        <div className="border"></div>
        <div>
          <p><small>Longest streak</small></p>
          <h3>{longestStreak.length} days</h3>
          <p><small>{_.first(longestStreak).format(shortFormat)} – {_.last(longestStreak).format(shortFormat)}</small></p>
        </div>
        <div className="border"></div>
        <div>
          <p><small>Current streak</small></p>
          <h3>{currentStreak ? currentStreak.length : 0} days</h3>
          {
            currentStreak ?
            <p><small>{_.first(currentStreak).format(shortFormat)} – {_.last(currentStreak).format(shortFormat)}</small></p> :
            <p>&nbsp;</p>
          }
        </div>
      </div>
      <div>{detail}</div>
    </div>;
  },
  formattedData: function() {
    var data = {}
    return _(this.state.data)
    .groupBy('Watched Date')
    .mapValues(function(rows) {
      return _.sum(rows, 'Rating') / rows.length;
    })
    .value();
  },
  selectDay: function(day) {

    this.setState({currentDay: moment(day).unix()});
  }
})
React.render(<App />, document.querySelector('#content'))

