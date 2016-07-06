
module.exports = function (grunt) {
require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
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
          'build:dev'
        ]
      },
      web: {
        files: [
          'index.js'
        ],
        tasks: [
          'build:dev',
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
      dev: {
        files: [
            { src: 'bower_components/bootstrap/dist/css/bootstrap.css', dest: 'public/bootstrap.css', expand: false },
            { src: 'bower_components/bootstrap/dist/fonts/*.*', dest: 'public/fonts/', expand: true, flatten: true, filter: 'isFile' },
            { src: 'bower_components/bootstrap/dist/js/bootstrap.js', dest: 'public/bootstrap.js', expand: false },
            { src: 'bower_components/jquery/dist/jquery.js', dest: 'public/jquery.js', expand: false },
            { src: 'bower_components/lodash/lodash.js', dest: 'public/lodash.js', expand: false },
            { src: 'bower_components/knockout/dist/knockout.debug.js', dest: 'public/knockout.js', expand: false },
            { src: 'bower_components/moment/min/moment.min.js', dest: 'public/moment.js', expand: false },
            { src: 'connector/elasticsearch-connector.css', dest: 'public/elasticsearch-connector.css', expand: false },
            { src: 'connector/elasticsearch-connector.js', dest: 'public/elasticsearch-connector.js', expand: false },
            { src: 'connector/aggregations.js', dest: 'public/aggregations.js', expand: false },
            { src: 'resources/bootstrap3-typeahead.js', dest: 'public/bootstrap3-typeahead.js', expand: false },
            { src: 'resources/ace.js', dest: 'public/ace.js', expand: false },
            { src: 'resources/mode-json.js', dest: 'public/mode-json.js', expand: false },
            { src: 'resources/theme-monokai.js', dest: 'public/theme-monokai.js', expand: false },
            { src: 'resources/theme-github.js', dest: 'public/theme-github.js', expand: false },
            { src: 'resources/theme-solarized_light.js', dest: 'public/theme-solarized_light.js', expand: false }
        ]
      },
      dist: {
        files: [
            { src: 'bower_components/bootstrap/dist/css/bootstrap.css', dest: 'dist-tmp/bootstrap.css', expand: false },
            { src: 'bower_components/bootstrap/dist/fonts/*.*', dest: 'dist/fonts/', expand: true, flatten: true, filter: 'isFile' },
            { src: 'bower_components/bootstrap/dist/js/bootstrap.js', dest: 'dist-tmp/bootstrap.js', expand: false },
            { src: 'bower_components/jquery/dist/jquery.js', dest: 'dist-tmp/jquery.js', expand: false },
            { src: 'bower_components/lodash/lodash.js', dest: 'dist-tmp/lodash.js', expand: false },
            { src: 'bower_components/knockout/dist/knockout.js', dest: 'dist-tmp/knockout.js', expand: false },
            { src: 'bower_components/moment/min/moment.min.js', dest: 'dist-tmp/moment.js', expand: false },
            { src: 'connector/elasticsearch-connector.css', dest: 'dist-tmp/elasticsearch-connector.css', expand: false },
            { src: 'connector/elasticsearch-connector.js', dest: 'dist-tmp/elasticsearch-connector.js', expand: false },
            { src: 'connector/aggregations.js', dest: 'dist-tmp/aggregations.js', expand: false },
            { src: 'resources/bootstrap3-typeahead.js', dest: 'dist-tmp/bootstrap3-typeahead.js', expand: false },
            { src: 'resources/ace.js', dest: 'dist-tmp/ace.js', expand: false },
            { src: 'resources/mode-json.js', dest: 'dist-tmp/mode-json.js', expand: false },
            { src: 'resources/theme-monokai.js', dest: 'dist-tmp/theme-monokai.js', expand: false },
            { src: 'resources/theme-github.js', dest: 'dist-tmp/theme-github.js', expand: false },
            { src: 'resources/theme-solarized_light.js', dest: 'dist-tmp/theme-solarized_light.js', expand: false }
        ]
      }
    },
    targethtml: {
      dev: {
        files: {
          'public/elasticsearch-connector.html': 'connector/elasticsearch-connector.tmpl.html'
        }
      },
      dist: {
        files: {
          'dist/elasticsearch-connector.html': 'connector/elasticsearch-connector.tmpl.html'
        }
      }
    },
    uglify: {
            options: {
                mangle: false,
                sourceMap: true,
                sourceMapIncludeSources: true,
                compress: false,
                banner: default_banner()
            },
            dist: {
              files: {
                'dist/elasticsearch-connector.min.js': [
                        'dist-tmp/jquery*.js',
                        'dist-tmp/bootstrap.js',
                        'dist-tmp/bootstrap3-typeahead.js',
                        'dist-tmp/knockout.js',
                        'dist-tmp/lodash*.js',
                        'dist-tmp/moment*.js',
                        'dist-tmp/elasticsearch-connector.js',
                        'dist-tmp/aggregations.js'
                    ]
              }
            }
    },
    cssmin: {
        options: {
            shorthandCompacting: false,
            roundingPrecision: -1
         },
         dist: {
            files: {
                'dist/elasticsearch-connector.min.css': ['dist-tmp/bootstrap.css', 'dist-tmp/elasticsearch-connector.css']
            }
         }
      },
      clean: {
          dev: [ 'public'],
          distTmp: [ 'dist-tmp'],
          dist: [ 'dist']
      },
  });
  
  grunt.registerTask('web', 'launch webserver and watch tasks', [ 'copy:dev', 'targethtml:dev',
    'parallel:web',
  ]);
  
  grunt.registerTask('build:dev', 'Build project, and watch sources for changes, run local webserver', [ 'clean:dev', 'copy:dev', 'targethtml:dev' ]);
  
  grunt.registerTask('build:dist', 'Build and create distribution', [ 'clean:dist', 'copy:dist', 'targethtml:dist', 'uglify:dist', 'cssmin:dist', 'clean:distTmp' ]);
  
  grunt.registerTask('default', 'Build project, and watch sources for changes, run local webserver', [ 'build:dev', 'web' ]);
};

var default_banner = function() {
    return '/*! \n\
 * ------ <%= pkg.name %> ------ \n\
 * \n\
 * @date <%= grunt.template.today("dddd, mmmm dS, yyyy, h:MM:ss TT") %> \n\
 * @version <%= pkg.version %> \n\
 * @copyright <%= grunt.template.today("yyyy") %> <%= pkg.author %> \n\
 * @license <%= pkg.license %> \n\
 */\n'
}