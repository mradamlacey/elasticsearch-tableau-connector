
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
          'bower_components/**/*.*'
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
    }
  });
  grunt.registerTask('web', 'launch webserver and watch tasks', [
    'parallel:web',
  ]);
  
  grunt.registerTask('default', ['web']);
};