
module.exports = function (grunt) {
require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    express: {
      options: {
        // Override defaults here
      },
      web: {
        options: {
          script: 'index.js',
        }
      },
    },
    watch: {
      frontend: {
        options: {
          livereload: true
        },
        files: [
          // triggering livereload when any files change
          'connector/*.*',
          'bower_components/**/*.*',
          'resources/**/*.*'
        ],
        tasks: [
          'build'
        ]
      },
      web: {
        files: [
          'index.js'
        ],
        tasks: [
          'express:web'
        ],
        options: {
          nospawn: true, // Without this option specified express won't be reloaded
          atBegin: true,
        }
      }
    },
    parallel: {
      web: {
        options: {
          stream: true
        },
        tasks: [{
          grunt: true,
          args: ['watch:frontend']
        }, 
		    {
          grunt: true,
          args: ['watch:web']
        }]
      },
    },
    copy: {
      main: {
        files: [
            { src: 'bower_components/bootstrap/dist/css/bootstrap.css', dest: 'public/bootstrap.css', expand: false },
            { src: 'bower_components/bootstrap/dist/js/bootstrap.js', dest: 'public/bootstrap.js', expand: false },
            { src: 'bower_components/jquery/dist/jquery.js', dest: 'public/jquery.js', expand: false },
            { src: 'bower_components/lodash/lodash.js', dest: 'public/lodash.js', expand: false },
            { src: 'bower_components/moment/min/moment.min.js', dest: 'public/moment.min.js', expand: false },
            { src: 'connector/elasticsearch-connector.html', dest: 'public/elasticsearch-connector.html', flatten: true, expand: false },
            { src: 'resources/elasticsearch.png', dest: 'public/elasticsearch.png', expand: false }
        ]
      }
    }
  });
  
  grunt.registerTask('web', 'launch webserver and watch tasks', [
    'parallel:web',
  ]);
  
    grunt.registerTask('build', 'launch webserver and watch tasks', [
    'parallel:web',
  ]);
  
  grunt.registerTask('build', 'Build project files', ['copy:main']);
};